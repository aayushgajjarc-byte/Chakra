import json
import logging
import os
from dotenv import load_dotenv

load_dotenv()

import re
import time
import hmac
from urllib.parse import parse_qs
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import jwt
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from wallet import analyze_wallet
from config import CACHE_TTL, CACHE_KEY_PREFIX
from database import db
from api_pool import get_etherscan_pool

app = FastAPI(
    title="Ethereum Wallet Dashboard API",
    version="2.0",
    description="CHAKRA — Full-forensic Ethereum wallet tracing backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("wallet-dashboard")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

@app.on_event("startup")
async def startup_db_client():
    await db.connect()

@app.on_event("shutdown")
async def shutdown_db_client():
    await db.disconnect()

# ---------------------------------------------------------------------------
# Redis — optional caching layer
# ---------------------------------------------------------------------------
# The system works fully without Redis. If Redis is unavailable (connection
# refused, not installed, wrong host), all caching calls are silently skipped
# and live Etherscan data is served instead.
# ---------------------------------------------------------------------------

_redis_client = None
_memory_cache = {} # Simple in-memory fallback for background precaching
_deep_dive_inflight = set()
ETHERSCAN_URL = "https://api.etherscan.io/v2/api"
CHAIN_ID_ETHEREUM = 1


async def _get_redis():
    """
    Lazily initialise the Redis async client.
    Returns None if Redis is unavailable so callers can degrade gracefully.
    """
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        import redis.asyncio as aioredis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        client = aioredis.from_url(redis_url, decode_responses=True, socket_connect_timeout=1)
        # Ping to verify connectivity — fail fast if Redis is not running
        await client.ping()
        _redis_client = client
        logger.info(f"[cache] Redis connected: {redis_url}")
        return _redis_client
    except Exception as e:
        logger.warning(f"[cache] Redis unavailable — caching disabled. ({type(e).__name__}: {e})")
        return None


async def _cache_get(key: str) -> Optional[dict]:
    """Return cached dict for key, checking Memory first, then Redis."""
    # Memory Check (Hot/Fallback)
    if key in _memory_cache:
        logger.info(f"[cache] MEM HIT  {key}")
        return _memory_cache[key]

    redis = await _get_redis()
    if redis is None:
        return None
    try:
        raw = await redis.get(key)
        if raw:
            logger.info(f"[cache] HIT  {key}")
            parsed = json.loads(raw)
            # Hydrate memory cache from Redis hit
            _memory_cache[key] = parsed
            return parsed
        logger.info(f"[cache] MISS {key}")
        return None
    except Exception as e:
        logger.warning(f"[cache] GET error: {e}")
        return None


async def _cache_set(key: str, value: dict, ttl: int = CACHE_TTL) -> None:
    """Store dict in Memory and Redis. Silently fails if Redis is down."""
    # Always store in memory for background task consistency
    _memory_cache[key] = value
    
    redis = await _get_redis()
    if redis is None:
        return
    try:
        await redis.setex(key, ttl, json.dumps(value, default=str))
        logger.info(f"[cache] SET  {key}  TTL={ttl}s")
    except Exception as e:
        logger.warning(f"[cache] SET error: {e}")


def _make_cache_key(address: str, hops: int, limit: int, page: int = 1) -> str:
    return f"{CACHE_KEY_PREFIX}:{address.lower()}:{hops}:{limit}:{page}"


def _normalize_etherscan_tx(tx: dict) -> dict:
    """Normalize Etherscan tx object for UI table (ETH unit + ISO time)."""
    out = dict(tx or {})
    raw_value = out.get("value", "0")
    try:
        s = str(raw_value or "0").strip()
        out["value"] = s if "." in s else str(int(s) / 10**18)
    except Exception:
        out["value"] = str(raw_value or "0")

    ts = out.get("timeStamp")
    if ts and not out.get("time"):
        try:
            out["time"] = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
        except Exception:
            pass
    return out


async def _fetch_all_normal_transactions(address: str, page_size: int = 1000) -> List[dict]:
    """
    Fetch full normal transaction history from Etherscan (newest first).
    Used for MongoDB-backed pagination.
    """
    pool = get_etherscan_pool()
    all_rows: List[dict] = []
    page = 1
    max_pages = 200  # safety cap
    while page <= max_pages:
        params = {
            "chainid": CHAIN_ID_ETHEREUM,
            "module": "account",
            "action": "txlist",
            "address": address,
            "page": page,
            "offset": page_size,
            "sort": "desc",
        }
        try:
            data = await pool.fetch(ETHERSCAN_URL, params)
        except Exception as e:
            logger.error("[etherscan] Full tx fetch failed for %s page=%s: %r", address, page, e)
            break

        status = str(data.get("status", "0"))
        result = data.get("result", [])
        if status != "1":
            # "No transactions found" is a valid terminal response.
            if "No transactions found" in str(result):
                break
            logger.warning("[etherscan] Unexpected txlist response for %s page=%s: %s", address, page, data.get("message"))
            break

        if not isinstance(result, list) or not result:
            break
        all_rows.extend([_normalize_etherscan_tx(row) for row in result])
        if len(result) < page_size:
            break
        page += 1

    return all_rows


# ---------------------------------------------------------------------------
# IP-based rate limiting
# ---------------------------------------------------------------------------

RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
_rate_limit_store: Dict[str, List[float]] = {}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    window_seconds = 60

    timestamps = _rate_limit_store.get(client_ip, [])
    timestamps = [ts for ts in timestamps if now - ts < window_seconds]

    if len(timestamps) >= RATE_LIMIT_PER_MINUTE:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Too many requests, please slow down."},
        )

    timestamps.append(now)
    _rate_limit_store[client_ip] = timestamps

    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s: %r", request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

ETH_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


def _sanitize_and_validate_address(address: str) -> str:
    addr = (address or "").strip()
    if not ETH_ADDRESS_RE.match(addr):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid wallet address format.",
        )
    return addr


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class WalletAnalyzeRequest(BaseModel):
    address: str = Field(..., description="Ethereum wallet address")
    hops: int = Field(1, ge=0, le=3, description="BFS depth")
    limit: int = Field(10, ge=1, le=500, description="Transactions per page")
    page: int = Field(1, ge=1, description="Current page number")
    refresh: bool = Field(
        False,
        description="If true, bypass MongoDB and fetch fresh Etherscan data.",
    )


class ClearCacheRequest(BaseModel):
    address: Optional[str] = Field(
        None,
        description="Optional Ethereum wallet address. If omitted, clears all cached queries and transactions.",
    )


# ---------------------------------------------------------------------------
# JWT authentication
# ---------------------------------------------------------------------------

DEMO_USERNAME = os.getenv("DEMO_USERNAME", "demo")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-prod")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_SECONDS = int(os.getenv("JWT_EXPIRE_SECONDS", "3600"))

security_scheme = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    username: str
    password: str


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.utcnow()
    if expires_delta is None:
        expires_delta = timedelta(seconds=JWT_EXPIRE_SECONDS)
    expire = now + expires_delta
    payload = {"sub": subject, "iat": now, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    username = payload.get("sub")
    if not username or not hmac.compare_digest(username, DEMO_USERNAME):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )
    return username


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "API is running", "version": "2.0"}


@app.post("/api/auth/login")
async def login(request: Request):
    """
    Demo login endpoint. Accepts application/json or
    application/x-www-form-urlencoded.
    """
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()

    if content_type == "application/json":
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Body must be a JSON object")
        username = (body.get("username") or "").strip()
        password = (body.get("password") or "").strip()

    elif content_type == "application/x-www-form-urlencoded":
        raw = await request.body()
        try:
            parsed = parse_qs(raw.decode("utf-8"), keep_blank_values=True)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid form body")
        username = (parsed.get("username") or [""])[0].strip()
        password = (parsed.get("password") or [""])[0].strip()

    else:
        raise HTTPException(
            status_code=400,
            detail="Content-Type must be application/json or application/x-www-form-urlencoded",
        )

    if not (
        hmac.compare_digest(username, DEMO_USERNAME)
        and hmac.compare_digest(password, DEMO_PASSWORD)
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    access_token = create_access_token(subject=username)
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/analyze/{input_value}")
async def analyze(
    input_value: str,
    hops: int = 1,
):
    """Backwards-compatible analysis endpoint."""
    cleaned = _sanitize_and_validate_address(input_value)
    cache_key = _make_cache_key(cleaned, hops, 10)
    
    # 1. Check Redis Cache
    cached = await _cache_get(cache_key)
    if cached:
        return cached
        
    # 2. Check MongoDB
    db_result = await db.get_query_data(cleaned)
    if db_result:
        # Check if DB result has enough hops
        if db_result.get("hops", 0) >= hops:
            await _cache_set(cache_key, db_result)
            return db_result
            
    # 3. Query Etherscan
    result = await analyze_wallet(cleaned, hops)
    await _cache_set(cache_key, result)
    await db.save_query(result)
    return result


@app.get("/api/v1/dashboard")
async def wallet_dashboard(
    address: str = Query(..., description="Ethereum wallet address"),
    hops: int = Query(1, ge=0, le=3),
    limit: int = Query(5, ge=1, le=500),
    page: int = Query(1, ge=1),
):
    """Returns wallet summary (balance, smart contract status) + transactions."""
    cleaned = _sanitize_and_validate_address(address)
    cache_key = _make_cache_key(cleaned, hops, limit, page)
    
    # 1. Check Redis Cache
    cached = await _cache_get(cache_key)
    if cached:
        logger.info("Served /api/v1/dashboard from cache for address=%s", cleaned)
        return cached
        
    # 2. Check MongoDB
    db_result = await db.get_query_data(cleaned)
    if db_result:
        if db_result.get("hops", 0) >= hops:
            await _cache_set(cache_key, db_result)
            return db_result
            
    # 3. Query Etherscan
    result = await analyze_wallet(cleaned, hops, limit, page)
    await _cache_set(cache_key, result)
    await db.save_query(result)
    logger.info("Served /api/v1/dashboard for address=%s hops=%s limit=%s", cleaned, hops, limit)
    return result


@app.post("/api/wallet/analyze")
async def analyze_wallet_post(
    payload: WalletAnalyzeRequest,
    background_tasks: BackgroundTasks,
):
    """
    Primary API endpoint for frontend wallet analysis.
    Returns full forensic data: normal + internal + ERC-20 transactions,
    BFS graph edges, backend risk score, and risk flags.
    Flow:
      1) Query MongoDB first (authoritative persisted cache).
      2) If missing/inadequate, fetch fresh data from Etherscan.
    Local in-memory/Redis cache is intentionally bypassed for this route.
    """
    cleaned = _sanitize_and_validate_address(payload.address)
    requested_page = max(1, int(payload.page))
    queried_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Refresh means: clear Mongo cache first, then repopulate from fresh source.
    if payload.refresh:
        await db.clear_wallet_cache(cleaned)
        logger.info(
            "Refresh requested; cleared Mongo cache for address=%s",
            cleaned,
        )

    # ------------------------------------------------------------------
    # MongoDB fast path (no Etherscan) when we already have a snapshot.
    # Note: the frontend sends hops=0 for "Quick" — until now this always
    # missed Mongo and re-hit Etherscan; we fix that here.
    # ------------------------------------------------------------------
    if not payload.refresh:
        db_result = await db.get_query_data(cleaned)
        if db_result:
            tx_page = await db.get_wallet_transactions_page(
                cleaned, requested_page, payload.limit
            )
            arch_total = int(tx_page.get("total_count", 0) or 0)
            chain_total = int(db_result.get("transaction_count") or 0)

            # Quick scan (hops=0): reuse any cached snapshot; paginate from
            # wallet_transactions when present, else from embedded transactions.
            if payload.hops == 0:
                quick_out = dict(db_result)
                quick_out["page"] = requested_page
                quick_out["tx_limit"] = int(payload.limit)
                quick_out["hops"] = 0
                if arch_total > 0:
                    norms = await db.get_normal_transaction_stats(cleaned)
                    quick_out["transactions"] = tx_page.get("transactions", [])
                    quick_out["transaction_count"] = norms["transaction_count"]
                    quick_out["incoming_count"] = norms["incoming_count"]
                    quick_out["outgoing_count"] = norms["outgoing_count"]
                    quick_out["connected_wallets_count"] = (
                        await db.get_connected_counterparty_count(cleaned)
                    )
                    quick_out["deep_dive_ready"] = True
                    quick_out["deep_dive_in_progress"] = False
                    logger.info(
                        "Served quick scan from Mongo (tx archive) address=%s page=%s limit=%s",
                        cleaned, requested_page, payload.limit,
                    )
                    return quick_out
                inline_txs = list(db_result.get("transactions") or [])
                lim = int(payload.limit)
                start = (requested_page - 1) * lim
                quick_out["transactions"] = inline_txs[start : start + lim]
                quick_out["deep_dive_ready"] = bool(
                    db_result.get("deep_dive_ready", False)
                )
                quick_out["deep_dive_in_progress"] = bool(
                    db_result.get("deep_dive_in_progress", False)
                )
                logger.info(
                    "Served quick scan from Mongo (inline snapshot) address=%s page=%s limit=%s",
                    cleaned, requested_page, payload.limit,
                )
                return quick_out

            # Deep-dive (hops>0): require stored BFS depth; paginate from archive
            # when we have rows, or serve an empty explorer if chain has no normal txs.
            if int(db_result.get("hops", 0) or 0) >= payload.hops:
                if arch_total > 0:
                    db_payload = dict(db_result)
                    db_payload["transactions"] = tx_page.get("transactions", [])
                    db_payload["page"] = requested_page
                    db_payload["tx_limit"] = int(payload.limit)
                    db_payload["deep_dive_ready"] = True
                    db_payload["deep_dive_in_progress"] = False
                    norms = await db.get_normal_transaction_stats(cleaned)
                    db_payload["transaction_count"] = norms["transaction_count"]
                    db_payload["incoming_count"] = norms["incoming_count"]
                    db_payload["outgoing_count"] = norms["outgoing_count"]
                    db_payload["connected_wallets_count"] = (
                        await db.get_connected_counterparty_count(cleaned)
                    )
                    logger.info(
                        "Served MongoDB transaction page for address=%s page=%s limit=%s",
                        cleaned, requested_page, payload.limit,
                    )
                    return db_payload
                if chain_total == 0:
                    empty_out = dict(db_result)
                    empty_out["transactions"] = []
                    empty_out["transaction_count"] = 0
                    empty_out["incoming_count"] = 0
                    empty_out["outgoing_count"] = 0
                    empty_out["connected_wallets_count"] = 0
                    empty_out["page"] = requested_page
                    empty_out["tx_limit"] = int(payload.limit)
                    empty_out["deep_dive_ready"] = True
                    empty_out["deep_dive_in_progress"] = False
                    logger.info(
                        "Served deep scan from Mongo (zero txs) address=%s",
                        cleaned,
                    )
                    return empty_out

    # Rebuild snapshot + full tx archive from Etherscan.
    snapshot = await analyze_wallet(cleaned, payload.hops, payload.limit, 1)
    snapshot["queried_at"] = queried_at
    snapshot["page"] = 1
    snapshot["tx_limit"] = int(payload.limit)

    if payload.hops > 0:
        full_txs = await _fetch_all_normal_transactions(cleaned)
        await db.replace_wallet_transactions(cleaned, full_txs, queried_at=queried_at)

        # Save canonical page-1 snapshot in queries collection.
        first_page = await db.get_wallet_transactions_page(cleaned, 1, payload.limit)
        snapshot["transactions"] = first_page.get("transactions", [])
        norms = await db.get_normal_transaction_stats(cleaned)
        snapshot.update(norms)
        snapshot["connected_wallets_count"] = await db.get_connected_counterparty_count(
            cleaned
        )
        await db.save_query(snapshot)

        # Return requested page (from MongoDB) to keep UI page navigation consistent.
        requested_tx_page = await db.get_wallet_transactions_page(cleaned, requested_page, payload.limit)
        response = dict(snapshot)
        response["transactions"] = requested_tx_page.get("transactions", [])
        response["page"] = requested_page
        response["deep_dive_ready"] = True
        response["deep_dive_in_progress"] = False
        logger.info(
            "Rebuilt Mongo cache and served page for address=%s page=%s limit=%s total=%s",
            cleaned, requested_page, payload.limit, response["transaction_count"],
        )
        return response

    # Quick mode keeps existing behavior with optional background enrichment.
    await db.save_query(snapshot)
    if requested_page == 1 and cleaned not in _deep_dive_inflight:
        _deep_dive_inflight.add(cleaned)
        snapshot["deep_dive_in_progress"] = True
        snapshot["deep_dive_ready"] = False
        background_tasks.add_task(_precache_deep_dive, cleaned, payload.limit)
    else:
        snapshot["deep_dive_in_progress"] = False
        snapshot["deep_dive_ready"] = False
    logger.info(
        "Served fresh quick snapshot for address=%s hops=%s limit=%s page=%s",
        cleaned, payload.hops, payload.limit, requested_page,
    )
    return snapshot


async def _precache_deep_dive(address: str, limit: int):
    """Background worker that persists deep snapshot + full tx archive."""
    try:
        queried_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        result = await analyze_wallet(address, hops=1, tx_limit=limit, page=1)
        result["queried_at"] = queried_at

        full_txs = await _fetch_all_normal_transactions(address)
        await db.replace_wallet_transactions(address, full_txs, queried_at=queried_at)

        norms = await db.get_normal_transaction_stats(address)
        result.update(norms)
        result["connected_wallets_count"] = await db.get_connected_counterparty_count(
            address
        )
        first_page = await db.get_wallet_transactions_page(address, 1, limit)
        result["transactions"] = first_page.get("transactions", [])
        await db.save_query(result)
        logger.info("[bg] Deep Dive snapshot + tx archive ready for %s (%s txs)", address, len(full_txs))
    except Exception as e:
        logger.error("[bg] Deep dive archive build failed for %s: %r", address, e)
    finally:
        _deep_dive_inflight.discard(address)

@app.get("/api/wallet/history")
async def get_history():
    """Returns the list of previously queried addresses from MongoDB."""
    history = await db.get_history()
    return {"history": history}


@app.post("/api/wallet/cache/clear")
async def clear_wallet_cache(payload: ClearCacheRequest):
    """Clear cached wallet query data and transaction archive."""
    address = payload.address.strip() if payload.address else None
    if address:
        address = _sanitize_and_validate_address(address)
    result = await db.clear_wallet_cache(address)
    return {"ok": True, "address": address, **result}
