import asyncio
import time
import os
import logging
import httpx
from typing import List, Optional, Dict, Any

logger = logging.getLogger("wallet-dashboard")

# ---------------------------------------------------------------------------
# Shared async HTTP client — created once, reused for all requests.
# Limits: 50 keepalive connections, 100 max total connections.
# ---------------------------------------------------------------------------
_shared_client: Optional[httpx.AsyncClient] = None


def get_shared_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        limits = httpx.Limits(
            max_keepalive_connections=50,
            max_connections=100,
            keepalive_expiry=30.0,
        )
        _shared_client = httpx.AsyncClient(
            limits=limits,
            timeout=httpx.Timeout(20.0, connect=5.0),
            http2=False,  # HTTP/1.1 is more compatible with Etherscan
        )
        logger.info("Created shared httpx.AsyncClient with connection pooling")
    return _shared_client


# ---------------------------------------------------------------------------
# EtherscanPool — async-safe, round-robin, rate-limit-aware key pool
# ---------------------------------------------------------------------------

class EtherscanPool:
    """
    High-performance Etherscan API key pool.

    Features:
    - asyncio.Queue for lock-free round-robin key rotation
    - 60s cooldown on rate-limited keys; auto-restore via background task
    - Global asyncio.Semaphore to cap concurrency at len(keys) * 5
    - Single shared httpx.AsyncClient (connection pooling, no reconnect overhead)
    - Graceful fallback when ALL keys are rate-limited
    """

    def __init__(self, api_keys: List[str]):
        if not api_keys:
            raise ValueError("At least one Etherscan API key is required")

        self.api_keys: List[str] = api_keys
        self._key_queue: asyncio.Queue = asyncio.Queue()
        # Populate round-robin queue
        for key in api_keys:
            self._key_queue.put_nowait(key)

        # Track cooldown expiry per key (0.0 = available)
        self._cooldown: Dict[str, float] = {k: 0.0 for k in api_keys}
        self._cooldown_lock = asyncio.Lock()

        # Concurrency semaphore — prevents request flooding
        max_concurrent = len(api_keys) * 5
        self._semaphore = asyncio.Semaphore(max_concurrent)
        logger.info(
            f"EtherscanPool ready: {len(api_keys)} keys, "
            f"semaphore={max_concurrent}, "
            f"keys={[k[:6]+'...' for k in api_keys]}"
        )

        # Metrics
        self.total_requests: int = 0
        self.rate_limited_count: int = 0

    # ------------------------------------------------------------------
    # Key management
    # ------------------------------------------------------------------

    async def _get_key(self, max_wait: float = 15.0) -> str:
        """
        Pull the next available key from the round-robin queue.
        Skips keys that are currently in cooldown and re-queues them.
        Raises RuntimeError if no key becomes available within max_wait seconds.
        """
        deadline = time.monotonic() + max_wait
        while True:
            if time.monotonic() > deadline:
                raise RuntimeError(
                    f"No Etherscan API key available after {max_wait}s — "
                    "all keys may be rate-limited or invalid."
                )
            key = await self._key_queue.get()
            now = time.monotonic()
            async with self._cooldown_lock:
                expiry = self._cooldown.get(key, 0.0)

            if now >= expiry:
                # Key is available — return it (it will be re-queued after use)
                return key
            else:
                # Key is in cooldown — put it back and wait briefly
                self._key_queue.put_nowait(key)
                wait = expiry - now
                logger.debug(f"Key {key[:6]}... in cooldown for {wait:.1f}s more, cycling...")
                await asyncio.sleep(min(wait, 0.5))

    async def _release_key(self, key: str):
        """Return a key to the round-robin queue after use."""
        self._key_queue.put_nowait(key)

    async def _mark_rate_limited(self, key: str, cooldown_seconds: float = 60.0):
        """
        Place a key in cooldown. It will be automatically re-inserted
        to the queue after the cooldown expires via a background task.
        """
        async with self._cooldown_lock:
            self._cooldown[key] = time.monotonic() + cooldown_seconds
            self.rate_limited_count += 1
        logger.warning(
            f"Key {key[:6]}... rate-limited — cooldown {cooldown_seconds:.0f}s"
        )

        # Schedule auto-restore: put key back in queue after cooldown
        async def _restore():
            await asyncio.sleep(cooldown_seconds + 0.5)
            async with self._cooldown_lock:
                self._cooldown[key] = 0.0
            self._key_queue.put_nowait(key)
            logger.info(f"Key {key[:6]}... restored to pool after cooldown")

        asyncio.create_task(_restore())

    @property
    def key_count(self) -> int:
        return len(self.api_keys)

    # ------------------------------------------------------------------
    # Core fetch method
    # ------------------------------------------------------------------

    async def fetch(
        self,
        url: str,
        params: Dict[str, Any],
        max_retries: int = 2,
    ) -> Dict[str, Any]:
        """
        Execute an async GET request using pooled keys and connection reuse.

        - Injects API key automatically
        - Retries on rate limits using a different key
        - Respects global semaphore for concurrency control
        - Uses shared httpx.AsyncClient (no reconnect overhead)
        """
        client = get_shared_client()
        last_error: Optional[Exception] = None

        async with self._semaphore:
            for attempt in range(max_retries + 1):
                key = await self._get_key()
                request_params = dict(params)
                request_params["apikey"] = key

                t0 = time.monotonic()
                try:
                    self.total_requests += 1
                    response = await client.get(url, params=request_params)
                    elapsed = time.monotonic() - t0

                    # --- HTTP-level rate limit ---
                    if response.status_code == 429:
                        logger.warning(
                            f"HTTP 429 on key {key[:6]}... "
                            f"(attempt {attempt+1}/{max_retries+1})"
                        )
                        await self._mark_rate_limited(key)
                        # DO NOT release the key — it's already handled by cooldown restore
                        continue

                    data: Dict[str, Any] = response.json()

                    # --- Etherscan application-level rate limit (explicit message) ---
                    msg_lower = str(data.get("message", "")).lower()
                    result_lower = str(data.get("result", "")).lower()
                    
                    is_rate_limit = (
                        "rate limit" in msg_lower or "max rate" in msg_lower or
                        "rate limit" in result_lower or "max rate" in result_lower
                    )
                    
                    is_notok = data.get("status") == "0" and data.get("message", "") == "NOTOK"
                    is_empty = "No transactions found" in result_lower or "No records found" in result_lower

                    if isinstance(data, dict) and is_rate_limit:
                        logger.warning(
                            f"Etherscan rate-limit on key {key[:6]}... "
                            f"(attempt {attempt+1}/{max_retries+1})"
                        )
                        await self._mark_rate_limited(key, cooldown_seconds=60.0)
                        continue

                    # --- Generic NOTOK (key blocked for this address / temporary error) ---
                    # Rotate to a different key with a short soft-cooldown.
                    # Do NOT treat "No transactions found" as NOTOK — that's a valid empty result.
                    if isinstance(data, dict) and is_notok and not is_empty:
                        logger.warning(
                            f"Etherscan NOTOK on key {key[:6]}... "
                            f"(attempt {attempt+1}/{max_retries+1}) — rotating key"
                        )
                        # Very short cooldown: 1s so retries are fast
                        await self._mark_rate_limited(key, cooldown_seconds=1.0)
                        continue

                    # --- Success (including legitimate empty results) ---
                    # Throttle rate to mathematically guarantee <5 req/sec per key
                    # so we never hit the hard limit during fast fallbacks
                    await asyncio.sleep(0.25)
                    await self._release_key(key)
                    logger.debug(
                        f"Fetch OK key={key[:6]}... elapsed={elapsed:.3f}s "
                        f"action={params.get('action','?')}"
                    )
                    return data

                except httpx.TimeoutException as e:
                    elapsed = time.monotonic() - t0
                    logger.warning(
                        f"Timeout on key {key[:6]}... after {elapsed:.1f}s "
                        f"(attempt {attempt+1}/{max_retries+1}): {e}"
                    )
                    await self._release_key(key)
                    last_error = e
                    await asyncio.sleep(0.2 * (attempt + 1))

                except httpx.RequestError as e:
                    logger.error(
                        f"Network error on key {key[:6]}... "
                        f"(attempt {attempt+1}/{max_retries+1}): {e}"
                    )
                    await self._release_key(key)
                    last_error = e
                    await asyncio.sleep(0.3 * (attempt + 1))

                except Exception as e:
                    logger.error(f"Unexpected error: {e}")
                    await self._release_key(key)
                    raise

        logger.error(
            f"Max retries ({max_retries}) exhausted for action={params.get('action','?')}"
        )
        if last_error:
            raise last_error
        return {"status": "0", "message": "Max retries exceeded", "result": []}


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_pool_instance: Optional[EtherscanPool] = None


def get_etherscan_pool() -> EtherscanPool:
    global _pool_instance
    if _pool_instance is None:
        keys: List[str] = []

        # --- Strategy 1: ETHERSCAN_API_KEY — support BOTH single and comma-separated ---
        primary = os.getenv("ETHERSCAN_API_KEY", "")
        if primary:
            # Split by comma to handle "key1,key2,key3,key4" format in .env
            for k in primary.split(","):
                k = k.strip()
                if k:
                    keys.append(k)

        # --- Strategy 2: ETHERSCAN_API_KEYS (explicit multi-key env var) ---
        multi = os.getenv("ETHERSCAN_API_KEYS", "")
        if multi:
            for k in multi.split(","):
                k = k.strip()
                if k:
                    keys.append(k)

        # --- Strategy 3: Indexed keys ETHERSCAN_API_KEY_2 … _10 ---
        for i in range(2, 11):
            k = os.getenv(f"ETHERSCAN_API_KEY_{i}", "")
            if k:
                keys.append(k.strip())

        # Deduplicate while preserving order
        seen = set()
        unique_keys: List[str] = []
        for k in keys:
            if k not in seen:
                seen.add(k)
                unique_keys.append(k)

        if not unique_keys:
            logger.warning(
                "No ETHERSCAN_API_KEY found. Using dummy key — requests will fail."
            )
            unique_keys = ["YourApiKeyToken"]

        logger.info(f"Initializing EtherscanPool with {len(unique_keys)} API keys")
        _pool_instance = EtherscanPool(unique_keys)

    return _pool_instance
