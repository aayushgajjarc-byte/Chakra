import json
import logging
import os
from dotenv import load_dotenv

load_dotenv()

import re
import time
import hmac
from urllib.parse import parse_qs
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import jwt
from fastapi import (
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

# ---------------------------------------------------------------------------
# Redis — optional caching layer
# ---------------------------------------------------------------------------
# The system works fully without Redis. If Redis is unavailable (connection
# refused, not installed, wrong host), all caching calls are silently skipped
# and live Etherscan data is served instead.
# ---------------------------------------------------------------------------

_redis_client = None


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
    """Return cached dict for key, or None on cache miss / Redis down."""
    redis = await _get_redis()
    if redis is None:
        return None
    try:
        raw = await redis.get(key)
        if raw:
            logger.info(f"[cache] HIT  {key}")
            return json.loads(raw)
        logger.info(f"[cache] MISS {key}")
        return None
    except Exception as e:
        logger.warning(f"[cache] GET error: {e}")
        return None


async def _cache_set(key: str, value: dict, ttl: int = CACHE_TTL) -> None:
    """Store dict in Redis with TTL. Silently fails if Redis is down."""
    redis = await _get_redis()
    if redis is None:
        return
    try:
        await redis.setex(key, ttl, json.dumps(value, default=str))
        logger.info(f"[cache] SET  {key}  TTL={ttl}s")
    except Exception as e:
        logger.warning(f"[cache] SET error: {e}")


def _make_cache_key(address: str, hops: int, limit: int) -> str:
    return f"{CACHE_KEY_PREFIX}:{address.lower()}:{hops}:{limit}"


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
    hops: int = Field(1, ge=0, le=3)
    limit: int = Field(5, ge=1, le=20)


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
    current_user: str = Depends(get_current_user),
):
    """Backwards-compatible analysis endpoint."""
    cleaned = _sanitize_and_validate_address(input_value)
    cache_key = _make_cache_key(cleaned, hops, 10)
    cached = await _cache_get(cache_key)
    if cached:
        return cached
    result = await analyze_wallet(cleaned, hops)
    await _cache_set(cache_key, result)
    return result


@app.get("/api/v1/dashboard")
async def wallet_dashboard(
    address: str = Query(..., description="Ethereum wallet address"),
    hops: int = Query(1, ge=0, le=3),
    limit: int = Query(5, ge=1, le=20),
    current_user: str = Depends(get_current_user),
):
    """Returns wallet summary (balance, smart contract status) + transactions."""
    cleaned = _sanitize_and_validate_address(address)
    cache_key = _make_cache_key(cleaned, hops, limit)
    cached = await _cache_get(cache_key)
    if cached:
        logger.info("Served /api/v1/dashboard from cache for address=%s", cleaned)
        return cached
    result = await analyze_wallet(cleaned, hops, limit)
    await _cache_set(cache_key, result)
    logger.info("Served /api/v1/dashboard for address=%s hops=%s limit=%s", cleaned, hops, limit)
    return result


@app.post("/api/wallet/analyze")
async def analyze_wallet_post(
    payload: WalletAnalyzeRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Primary API endpoint for frontend wallet analysis.
    Returns full forensic data: normal + internal + ERC-20 transactions,
    BFS graph edges, backend risk score, and risk flags.
    Results are cached in Redis for CACHE_TTL seconds.
    """
    cleaned = _sanitize_and_validate_address(payload.address)
    cache_key = _make_cache_key(cleaned, payload.hops, payload.limit)

    cached = await _cache_get(cache_key)
    if cached:
        logger.info(
            "Served /api/wallet/analyze from cache for address=%s hops=%s limit=%s",
            cleaned, payload.hops, payload.limit,
        )
        return cached

    result = await analyze_wallet(cleaned, payload.hops, payload.limit)
    await _cache_set(cache_key, result)
    logger.info(
        "Served /api/wallet/analyze for address=%s hops=%s limit=%s",
        cleaned, payload.hops, payload.limit,
    )
    return result
