"""
config.py -- Centralized constants for the CHAKRA blockchain tracing backend.

Performance-tuned for <5s response time:
  - Block window limited to recent 200,000 blocks instead of full history
  - Chunk count capped at 3 (reduced from 12)
  - BFS wallet cap per hop = 5 (prevents exponential growth)
  - In-memory cache TTL = 60s (avoids re-fetching BFS nodes)
"""

# ---------------------------------------------------------------------------
# Ethereum / Block range
# ---------------------------------------------------------------------------

# Fallback "latest" block when the real fetch fails
MAX_BLOCK: int = 99_999_999

# Minimum ETH value for a transaction to be included in BFS traversal
MIN_ETH_VALUE: float = 0.001

# Maximum parallel block-range chunks for the main wallet fetch
# Reduced from 12 → 1 for speed and to respect Etherscan's 5 req/sec limit
MAX_CHUNKS: int = 1

# Number of chunks used per BFS hop node
# Kept at 1: BFS already narrows to a recent block window, so 1 chunk is enough
BFS_CHUNK_COUNT: int = 1

# Etherscan hard cap per single API call — pagination triggers at this count
ETHERSCAN_RESULT_LIMIT: int = 10_000

# ---------------------------------------------------------------------------
# Block Window -- recent-only fetching for speed
# ---------------------------------------------------------------------------

# Only fetch transactions from the last N blocks (~27 days at 12s/block)
# Set to 0 to disable window and fetch full history (much slower)
RECENT_BLOCKS_WINDOW: int = 200_000

# ---------------------------------------------------------------------------
# BFS Tracing -- size limits to prevent exponential growth
# ---------------------------------------------------------------------------

# Default hop depth for wallet traversal (overridden by API query param)
BFS_DEFAULT_HOPS: int = 1

# Default max transactions emitted per BFS node
BFS_DEFAULT_TX_LIMIT: int = 10

# Maximum wallets expanded per BFS hop layer
# Without this, a wallet with 50 counterparties at hop 1 spawns 2500 at hop 2
BFS_MAX_WALLETS_PER_HOP: int = 3

# ---------------------------------------------------------------------------
# In-Memory BFS Node Cache
# ---------------------------------------------------------------------------

# Seconds a BFS node's fetch result is cached in memory
# Prevents re-fetching the same wallet multiple times within one analysis
BFS_CACHE_TTL: float = 60.0

# Per-node timeout for BFS counterparty fetching (seconds)
# Increased to 10.0s so older wallets triggering the full-history fallback
# have enough time to scan 24M blocks without being skipped.
BFS_NODE_TIMEOUT: float = 10.0

# ---------------------------------------------------------------------------
# API Key Pool
# ---------------------------------------------------------------------------

# Seconds a rate-limited key stays in cooldown before re-admission
API_KEY_COOLDOWN: float = 60.0

# Semaphore = key_count x SEMAPHORE_MULTIPLIER (caps concurrent requests)
SEMAPHORE_MULTIPLIER: int = 5

# Max retry attempts for a single Etherscan fetch
MAX_RETRIES: int = 3

# ---------------------------------------------------------------------------
# Redis Cache (server-level, optional)
# ---------------------------------------------------------------------------

# Seconds a wallet analysis result is cached before eviction
CACHE_TTL: int = 300

# Redis key prefix
CACHE_KEY_PREFIX: str = "wallet_analysis"
