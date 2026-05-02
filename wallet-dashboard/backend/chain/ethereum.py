"""
chain/ethereum.py -- Full-forensic Ethereum wallet data fetcher.

Performance Edition: optimized for <5s response time.

Key optimizations vs the previous version:
  (A) Recent-window fetching: only queries the last RECENT_BLOCKS_WINDOW blocks
      instead of scanning from block 0. This alone cuts fetch time by ~97%.
  (B) Reduced chunk count: MAX_CHUNKS=3 (was 12). Fewer parallel HTTP calls
      means less API key pressure and faster scheduling overhead.
  (C) Single latest_block fetch: latestBlock is fetched once at analysis start
      and passed through to every function -- no repeated proxy calls.
  (D) BFS wallet cap: at most BFS_MAX_WALLETS_PER_HOP wallets expanded per
      hop layer, preventing exponential node explosion.
  (E) In-memory BFS cache: BFS node results are cached for BFS_CACHE_TTL
      seconds. If the same wallet appears in multiple hop layers, it is
      served from cache instead of re-fetching.
  (F) Parallel everything: balance, txlist, txlistinternal, tokentx, and BFS
      all fire concurrently inside ethereum_wallet_info().
  (G) 3 retries max (was 4): saves up to 20s on consistently failing keys.
"""

from __future__ import annotations

import asyncio
import math
import time
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from api_pool import get_etherscan_pool
from config import (
    MAX_BLOCK,
    MIN_ETH_VALUE,
    MAX_CHUNKS,
    BFS_CHUNK_COUNT,
    ETHERSCAN_RESULT_LIMIT,
    RECENT_BLOCKS_WINDOW,
    BFS_MAX_WALLETS_PER_HOP,
    BFS_CACHE_TTL,
    BFS_NODE_TIMEOUT,
)

logger = logging.getLogger("wallet-dashboard")

ETHERSCAN_URL = "https://api.etherscan.io/v2/api"
CHAIN_ID_ETHEREUM = 1

# ---------------------------------------------------------------------------
# In-memory BFS node cache  {address -> (timestamp, (edges, wallets))}
# ---------------------------------------------------------------------------
_bfs_cache: Dict[str, Tuple[float, Tuple[List, List]]] = {}


def _bfs_cache_get(address: str) -> Optional[Tuple[List, List]]:
    """Return cached BFS node result if still within TTL, else None."""
    entry = _bfs_cache.get(address)
    if entry is None:
        return None
    ts, data = entry
    if time.monotonic() - ts > BFS_CACHE_TTL:
        del _bfs_cache[address]
        return None
    logger.debug(f"[cache] BFS hit for {address[:10]}...")
    return data


def _bfs_cache_set(address: str, data: Tuple[List, List]) -> None:
    _bfs_cache[address] = (time.monotonic(), data)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dedup_and_sort(
    txs: List[Dict[str, Any]], sort_desc: bool = True
) -> List[Dict[str, Any]]:
    """De-duplicate by 'hash' / 'transactionHash', sort by blockNumber."""
    seen: Set[str] = set()
    unique: List[Dict[str, Any]] = []
    for tx in txs:
        h = tx.get("hash") or tx.get("transactionHash") or ""
        if h and h in seen:
            continue
        if h:
            seen.add(h)
        unique.append(tx)
    unique.sort(key=lambda x: int(x.get("blockNumber", 0) or 0), reverse=sort_desc)
    return unique


def _make_block_chunks(
    start_block: int, end_block: int, chunk_count: int
) -> List[Tuple[int, int]]:
    """Divide [start_block, end_block] into chunk_count equal slices."""
    if start_block > end_block:
        return [(start_block, end_block)]
    total = end_block - start_block + 1
    chunk_size = math.ceil(total / chunk_count)
    chunks: List[Tuple[int, int]] = []
    for i in range(chunk_count):
        s = start_block + i * chunk_size
        e = min(s + chunk_size - 1, end_block)
        if s > end_block:
            break
        chunks.append((s, e))
    return chunks


def _fmt_time(ts: Any) -> str:
    if ts is None:
        return ""
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except Exception:
        return str(ts)


def _fmt_value_eth(v: Any) -> str:
    """Convert raw wei string or float to a decimal-ETH string."""
    if v is None:
        return "0"
    try:
        if isinstance(v, (float, int)):
            return str(float(v))
        s = str(v)
        return s if "." in s else str(int(s) / 10**18)
    except Exception:
        return str(v)


# ---------------------------------------------------------------------------
# Phase 1 -- Latest block
# ---------------------------------------------------------------------------

async def fetch_latest_block_number() -> int:
    """Fetches the latest Ethereum block number from Etherscan proxy."""
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "proxy",
        "action": "eth_blockNumber",
    }
    pool = get_etherscan_pool()
    t0 = time.monotonic()
    try:
        data = await pool.fetch(ETHERSCAN_URL, params)
        result = data.get("result")
        if result:
            block = int(result, 16)
            logger.info(f"[ethereum] Latest block: {block} ({time.monotonic()-t0:.2f}s)")
            return block
        logger.warning("[ethereum] Could not parse latest block, using fallback")
        return MAX_BLOCK
    except Exception as e:
        logger.error(f"[ethereum] fetch_latest_block_number error: {e}")
        return MAX_BLOCK


# ---------------------------------------------------------------------------
# Phase 2 -- Single-chunk + pagination-safe fetcher
# ---------------------------------------------------------------------------

# Maximum bisection depth for pagination splits -- prevents infinite recursion
MAX_PAGINATION_DEPTH: int = 10


# ---------------------------------------------------------------------------
# Phase 2 -- Paged Fetcher & Fast Counter
# ---------------------------------------------------------------------------

async def _fetch_total_count(address: str, action: str) -> int:
    """
    Quickly estimate the total number of transactions by using a sliding block window.
    Bypasses Etherscan's 10,000-row pagination limit by shifting startblock instead
    of incrementing page numbers.
    """
    total = 0
    current_start = 0
    limit = 10000
    pool = get_etherscan_pool()
    retries = 0
    
    while True:
        params = {
            "chainid": CHAIN_ID_ETHEREUM,
            "module": "account",
            "action": action,
            "address": address,
            "startblock": current_start,
            "endblock": 99999999,
            "page": 1,
            "offset": limit,
            "sort": "asc",
        }
        try:
            data = await pool.fetch(ETHERSCAN_URL, params)
            if data.get("status") == "1":
                rows = data.get("result", [])
                total += len(rows)
                logger.info(f"[ethereum] Count scan: Found {len(rows)} rows (Total: {total}). Sliding window...")
                
                if len(rows) < limit:
                    break
                
                # Slide window: next fetch starts after the last block we saw
                last_block = int(rows[-1].get("blockNumber", current_start))
                current_start = last_block + 1
                retries = 0
            elif "No transactions found" in str(data.get("result", "")):
                break
            else:
                retries += 1
                if retries > 2: break
                await asyncio.sleep(1.0)
        except Exception as e:
            logger.error(f"[ethereum] Count scan exception: {e}")
            break
            
    return total

async def _fetch_paged(
    address: str,
    action: str,
    limit: int = 50,
    page: int = 1,
    sort: str = "desc",
) -> List[Dict[str, Any]]:
    """
    Fetch a specific number of transactions using Etherscan pagination.
    This is significantly faster than block-range fetching for high-volume wallets
    because it stops as soon as the limit is reached.
    """
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "account",
        "action": action,
        "address": address,
        "page": page,
        "offset": limit,
        "sort": sort,
    }
    pool = get_etherscan_pool()
    t0 = time.monotonic()
    logger.debug(f"[ethereum] API paged: action={action} addr={address[:10]}... limit={limit}")
    
    try:
        data = await pool.fetch(ETHERSCAN_URL, params)
        if data.get("status") == "1":
            result = data.get("result", [])
            logger.info(f"[ethereum] {action} paged OK: {len(result)} rows in {time.monotonic()-t0:.2f}s")
            return result
        return []
    except Exception as e:
        logger.error(f"[ethereum] _fetch_paged({action}) error: {e}")
        return []


async def _fetch_range(
    address: str,
    action: str,
    start_block: int,
    end_block: int,
    _depth: int = 0,
) -> List[Dict[str, Any]]:
    """
    Fetch one block range for the given Etherscan action.

    Auto-bisects if result hits ETHERSCAN_RESULT_LIMIT.
    Depth-capped at MAX_PAGINATION_DEPTH to prevent infinite recursion.
    """
    if start_block > end_block:
        return []

    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "account",
        "action": action,
        "address": address,
        "startblock": start_block,
        "endblock": end_block,
        "sort": "desc",  # Use desc for faster recent-first fetching
    }
    pool = get_etherscan_pool()
    t0 = time.monotonic()
    logger.debug(
        f"[ethereum] API call: action={action} addr={address[:10]}... "
        f"blocks [{start_block}->{end_block}] depth={_depth}"
    )
    try:
        data = await pool.fetch(ETHERSCAN_URL, params)
    except Exception as e:
        logger.error(f"[ethereum] _fetch_range({action}) error after {time.monotonic()-t0:.2f}s: {e}")
        return []

    elapsed = time.monotonic() - t0

    if data.get("status") != "1":
        msg = data.get("message", "")
        result_val = data.get("result", "")
        if "No transactions found" not in str(result_val):
            logger.warning(
                f"[ethereum] Etherscan {action} status=0 msg={msg!r} "
                f"blocks=[{start_block}->{end_block}] ({elapsed:.2f}s)"
            )
        return []

    result: List[Dict[str, Any]] = data.get("result", [])
    result_count = len(result)
    logger.debug(f"[ethereum] API done: action={action} rows={result_count} in {elapsed:.2f}s")

    # Pagination split
    if result_count >= ETHERSCAN_RESULT_LIMIT and start_block < end_block:
        if _depth >= MAX_PAGINATION_DEPTH:
            logger.warning(
                f"[ethereum] Pagination depth limit ({MAX_PAGINATION_DEPTH}) "
                f"reached for {action} blocks=[{start_block}->{end_block}]. "
                f"Returning {result_count} truncated rows."
            )
            return result

        mid = (start_block + end_block) // 2
        logger.info(
            f"[ethereum] Pagination split (depth={_depth+1}): {action} "
            f"[{start_block}->{mid}] + [{mid+1}->{end_block}] ({result_count} rows)"
        )
        left, right = await asyncio.gather(
            _fetch_range(address, action, start_block, mid, _depth + 1),
            _fetch_range(address, action, mid + 1, end_block, _depth + 1),
            return_exceptions=True,
        )
        merged: List[Dict[str, Any]] = []
        for part in (left, right):
            if isinstance(part, list):
                merged.extend(part)
        return merged

    return result


# ---------------------------------------------------------------------------
# Phase 3 -- Chunked parallel fetchers (recent-window, 3 chunks max)
# ---------------------------------------------------------------------------

def _recent_block_range(latest_block: int) -> Tuple[int, int]:
    """
    Return (start_block, end_block) for the recent window.

    Instead of scanning from block 0 (years of history), we only look at
    the last RECENT_BLOCKS_WINDOW blocks. For RECENT_BLOCKS_WINDOW=200_000
    and ~12s/block, this covers approximately the last 27 days of activity.

    WHY THIS WORKS: For BFS forensic tracing we care about recent money flows,
    not a wallet's full lifetime. Recent-window fetching is ~97% faster.
    """
    start = max(0, latest_block - RECENT_BLOCKS_WINDOW)
    return start, latest_block


async def _fetch_chunked(
    address: str,
    action: str,
    start_block: int,
    end_block: int,
    chunk_count: int = MAX_CHUNKS,
    label: str = "",
) -> List[Dict[str, Any]]:
    """
    Generic chunked fetcher: splits [start_block, end_block] into chunk_count
    sub-ranges, fires them ALL concurrently, merges and deduplicates.
    """
    chunks = _make_block_chunks(start_block, end_block, chunk_count)
    t0 = time.monotonic()
    logger.info(
        f"[ethereum] {label or action}: {len(chunks)} chunks "
        f"for {address[:10]}... blocks [{start_block}->{end_block}]"
    )

    tasks = [_fetch_range(address, action, s, e) for s, e in chunks]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    all_txs: List[Dict[str, Any]] = []
    for res in raw_results:
        if isinstance(res, list):
            all_txs.extend(res)
        elif isinstance(res, Exception):
            logger.error(f"[ethereum] {label} chunk failed: {res}")

    merged = _dedup_and_sort(all_txs, sort_desc=True)
    logger.info(
        f"[ethereum] {label or action}: {len(merged)} txs in {time.monotonic()-t0:.2f}s"
    )
    return merged


async def _fetch_with_fallback(
    address: str,
    action: str,
    recent_start: int,
    end_block: int,
    chunk_count: int = MAX_CHUNKS,
    label: str = "",
) -> List[Dict[str, Any]]:
    """
    Try the recent-window first for speed.
    If 0 results are found (wallet has no recent activity), automatically
    retry with full history from block 0.

    This fixes older wallets like 0x8d1b... whose transactions exist but
    fall outside the RECENT_BLOCKS_WINDOW, without slowing down active
    wallets that return results from the recent window immediately.
    """
    results = await _fetch_chunked(address, action, recent_start, end_block, chunk_count, label)
    if results:
        return results

    # Recent window returned nothing -- fall back to full history
    # Use chunk_count=1 for full history to avoid rate-limiting the Etherscan API.
    # A single call from block 0 is enough for older wallets to find their activity.
    if recent_start > 0:
        logger.info(
            f"[ethereum] {label or action}: 0 results in recent window "
            f"[{recent_start}->{end_block}], retrying from block 0 (full history)"
        )
        return await _fetch_chunked(address, action, 0, end_block, 1, f"{label} [full]")

    return results


async def fetch_transactions_chunked(
    address: str, latest_block: Optional[int] = None
) -> List[Dict[str, Any]]:
    if latest_block is None:
        latest_block = await fetch_latest_block_number()
    start, end = _recent_block_range(latest_block)
    return await _fetch_chunked(address, "txlist", start, end, MAX_CHUNKS, "Normal txs")


async def fetch_internal_transactions_chunked(
    address: str, latest_block: Optional[int] = None
) -> List[Dict[str, Any]]:
    if latest_block is None:
        latest_block = await fetch_latest_block_number()
    start, end = _recent_block_range(latest_block)
    return await _fetch_chunked(address, "txlistinternal", start, end, MAX_CHUNKS, "Internal txs")


async def fetch_token_transfers_chunked(
    address: str, latest_block: Optional[int] = None
) -> List[Dict[str, Any]]:
    if latest_block is None:
        latest_block = await fetch_latest_block_number()
    start, end = _recent_block_range(latest_block)
    return await _fetch_chunked(address, "tokentx", start, end, MAX_CHUNKS, "Token transfers")


async def fetch_transaction_count(address: str) -> int:
    """
    Fetches the total number of outgoing transactions (nonce) for the address.
    This provides a 'Total Transactions' count that is independent of the
    display limit used for the transaction list.
    """
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "proxy",
        "action": "eth_getTransactionCount",
        "address": address,
        "tag": "latest",
    }
    pool = get_etherscan_pool()
    try:
        data = await pool.fetch(ETHERSCAN_URL, params)
        result = data.get("result")
        if result:
            return int(result, 16)
        return 0
    except Exception as e:
        logger.error(f"[ethereum] fetch_transaction_count error for {address}: {e}")
        return 0


# ---------------------------------------------------------------------------
# Balance & contract checks
# ---------------------------------------------------------------------------

async def fetch_balance(address: str) -> float:
    """Fetches ETH balance in ether."""
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "account",
        "action": "balance",
        "address": address,
        "tag": "latest",
    }
    pool = get_etherscan_pool()
    t0 = time.monotonic()
    try:
        data = await pool.fetch(ETHERSCAN_URL, params)
        if "result" not in data:
            return 0.0
        balance_eth = int(data["result"]) / 10**18
        logger.info(f"[ethereum] Balance: {balance_eth:.4f} ETH ({time.monotonic()-t0:.2f}s)")
        return balance_eth
    except Exception as e:
        logger.error(f"[ethereum] fetch_balance error for {address}: {e}")
        return 0.0


async def is_smart_contract(address: str) -> bool:
    """Returns True if the address has deployed bytecode."""
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "proxy",
        "action": "eth_getCode",
        "address": address,
        "tag": "latest",
    }
    pool = get_etherscan_pool()
    try:
        data = await pool.fetch(ETHERSCAN_URL, params)
        code = data.get("result")
        return code not in ("0x", "0x0", None, "")
    except Exception as e:
        logger.error(f"[ethereum] is_smart_contract error for {address}: {e}")
        return False


async def batch_is_contract(addresses: List[str]) -> Dict[str, bool]:
    """
    Checks whether each address in the list is a smart contract.
    All checks run concurrently. De-duplicates input.
    """
    unique = list(set(a.lower() for a in addresses if a))
    if not unique:
        return {}
    results = await asyncio.gather(
        *[is_smart_contract(addr) for addr in unique], return_exceptions=True
    )
    return {
        addr: (res if isinstance(res, bool) else False)
        for addr, res in zip(unique, results)
    }


# ---------------------------------------------------------------------------
# BFS helpers -- edge collectors per transaction type
# ---------------------------------------------------------------------------

def _collect_normal_hops(
    txs: List[Dict[str, Any]],
    tx_limit: int,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Build edge records from normal (txlist) transactions.

    Contract-call txs (input != '0x') get type='contract'.
    Plain ETH transfers get type='eth'.
    Failed txs and dust-only pure-ETH transfers are skipped.
    """
    edges: List[Dict[str, Any]] = []
    new_wallets: List[str] = []

    for tx in txs:
        if tx.get("isError") == "1":
            continue

        from_addr = (tx.get("from") or "").lower()
        to_addr = (tx.get("to") or "").lower() if tx.get("to") else None

        eth_value = int(tx.get("value", "0") or "0") / 10**18
        is_contract_call = tx.get("input", "0x") not in ("0x", "", None)

        if eth_value < MIN_ETH_VALUE and not is_contract_call:
            continue

        tx_type = "contract" if is_contract_call else "eth"

        edges.append(
            {
                "type": tx_type,
                "from": from_addr,
                "to": to_addr,
                "value": _fmt_value_eth(tx.get("value", "0")),
                "time": _fmt_time(tx.get("timeStamp")),
                "hash": tx.get("hash", ""),
                "chain": "ethereum",
                "is_contract_call": is_contract_call,
            }
        )

        if from_addr:
            new_wallets.append(from_addr)
        if to_addr:
            new_wallets.append(to_addr)

        if len(edges) >= tx_limit:
            break

    return edges, new_wallets


def _collect_internal_hops(
    txs: List[Dict[str, Any]],
    tx_limit: int,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Build edge records from internal (txlistinternal) transactions."""
    edges: List[Dict[str, Any]] = []
    new_wallets: List[str] = []

    for tx in txs:
        if tx.get("isError") == "1":
            continue

        from_addr = (tx.get("from") or "").lower()
        to_addr = (tx.get("to") or "").lower() if tx.get("to") else None
        eth_value = int(tx.get("value", "0") or "0") / 10**18

        if eth_value < MIN_ETH_VALUE:
            continue

        edges.append(
            {
                "type": "internal",
                "from": from_addr,
                "to": to_addr,
                "value": _fmt_value_eth(tx.get("value", "0")),
                "time": _fmt_time(tx.get("timeStamp")),
                "hash": tx.get("hash", "") or tx.get("transactionHash", ""),
                "chain": "ethereum",
            }
        )

        if from_addr:
            new_wallets.append(from_addr)
        if to_addr:
            new_wallets.append(to_addr)

        if len(edges) >= tx_limit:
            break

    return edges, new_wallets


def _collect_token_hops(
    txs: List[Dict[str, Any]],
    tx_limit: int,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Build edge records from ERC-20 token transfers (tokentx)."""
    edges: List[Dict[str, Any]] = []
    new_wallets: List[str] = []

    for tx in txs:
        from_addr = (tx.get("from") or "").lower()
        to_addr = (tx.get("to") or "").lower() if tx.get("to") else None
        if not from_addr or not to_addr:
            continue

        token_symbol = tx.get("tokenSymbol") or tx.get("tokenName") or "TOKEN"
        token_contract = (tx.get("contractAddress") or "").lower()
        decimals = int(tx.get("tokenDecimal") or 18)
        raw_value = int(tx.get("value", "0") or "0")
        try:
            token_value = raw_value / (10**decimals)
        except Exception:
            token_value = 0.0

        edges.append(
            {
                "type": "erc20",
                "from": from_addr,
                "to": to_addr,
                "value": str(round(token_value, 6)),
                "time": _fmt_time(tx.get("timeStamp")),
                "hash": tx.get("hash", ""),
                "chain": "ethereum",
                "token_symbol": token_symbol,
                "token_contract": token_contract,
            }
        )

        new_wallets.append(from_addr)
        new_wallets.append(to_addr)

        if len(edges) >= tx_limit:
            break

    return edges, new_wallets


# ---------------------------------------------------------------------------
# Risk scoring engine
# ---------------------------------------------------------------------------

def compute_risk_score(
    all_edges: List[Dict[str, Any]],
    wallet_address: str,
    is_contract: bool,
) -> Tuple[int, List[str]]:
    """
    Compute a 0-100 risk score using 5 forensic heuristics.
    Returns (risk_score: int, risk_flags: List[str])
    """
    if not all_edges:
        return 0, []

    score = 0
    flags: List[str] = []

    eth_values = [
        float(e["value"]) for e in all_edges
        if e.get("type") in ("eth", "internal") and e.get("value")
    ]

    # Heuristic 1: Large value spike
    if eth_values and len(eth_values) > 1:
        avg = sum(eth_values) / len(eth_values)
        std = math.sqrt(sum((v - avg) ** 2 for v in eth_values) / len(eth_values))
        max_val = max(eth_values)
        if std > 0 and (max_val - avg) / std > 4:
            score += 25
            flags.append(f"Extreme value spike: max={max_val:.2f} ETH vs avg={avg:.4f} ETH")
        elif std > 0 and (max_val - avg) / std > 2:
            score += 10
            flags.append(f"Unusual value spike: max={max_val:.2f} ETH")

    # Heuristic 2: Transaction velocity
    timestamps = []
    for e in all_edges:
        t_str = e.get("time", "")
        if t_str:
            try:
                ts = datetime.fromisoformat(t_str.replace("Z", "+00:00"))
                timestamps.append(ts.timestamp())
            except Exception:
                pass

    if len(timestamps) > 1:
        timestamps.sort()
        time_span_seconds = timestamps[-1] - timestamps[0]
        if time_span_seconds > 0:
            txs_per_hour = len(timestamps) / (time_span_seconds / 3600)
            if txs_per_hour > 100:
                score += 25
                flags.append(f"High transaction velocity: {txs_per_hour:.0f} txs/hour")
            elif txs_per_hour > 30:
                score += 10
                flags.append(f"Elevated transaction velocity: {txs_per_hour:.0f} txs/hour")

    # Heuristic 3: New wallet burst
    all_addresses = set()
    for e in all_edges:
        if e.get("to"):
            all_addresses.add(e["to"])
        if e.get("from"):
            all_addresses.add(e["from"])
    all_addresses.discard(wallet_address)

    unique_counterparty_count = len(all_addresses)
    if unique_counterparty_count > 50:
        score += 20
        flags.append(f"Large counterparty network: {unique_counterparty_count} unique addresses")
    elif unique_counterparty_count > 20:
        score += 10
        flags.append(f"Notable counterparty network: {unique_counterparty_count} unique addresses")

    # Heuristic 4: Circular fund flow
    forward_pairs: Set[Tuple[str, str]] = set()
    circular_count = 0
    for e in all_edges:
        f = (e.get("from") or "").lower()
        t = (e.get("to") or "").lower()
        if f and t:
            if (t, f) in forward_pairs:
                circular_count += 1
            forward_pairs.add((f, t))

    if circular_count >= 3:
        score += 20
        flags.append(f"Circular fund flow detected: {circular_count} instances")
    elif circular_count >= 1:
        score += 8
        flags.append(f"Possible circular flow: {circular_count} round-trip(s)")

    # Heuristic 5: ERC-20 mixing ratio
    erc20_count = sum(1 for e in all_edges if e.get("type") == "erc20")
    total_count = len(all_edges)
    if total_count > 0 and erc20_count / total_count > 0.8:
        score += 10
        flags.append(
            f"High ERC-20 ratio ({erc20_count}/{total_count} txs): "
            "possible token-based layering"
        )

    return min(100, score), flags


# ---------------------------------------------------------------------------
# BFS wallet hop traversal -- parallel depth-layer expansion + cache
# ---------------------------------------------------------------------------

async def _process_bfs_node(
    address: str,
    start_block: int,
    end_block: int,
    tx_limit: int,
    depth: int = 0,
    seed_normal: Optional[List[Dict[str, Any]]] = None,
    seed_internal: Optional[List[Dict[str, Any]]] = None,
    seed_token: Optional[List[Dict[str, Any]]] = None,
    page: int = 1,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Fetch and collect edge types for one BFS node.

    Speed strategy based on depth:
      depth=0 (seed wallet): fetch all 3 types (txlist + internal + tokentx)
      depth>0 (counterparty): fetch ONLY txlist — we only need to know what
        wallets it touched, not its full token history. This cuts API calls
        from 3 per node to 1, which is 3x faster at hop 1.

    Uses in-memory cache to avoid re-fetching the same address.
    """
    cached = _bfs_cache_get(address)
    if cached is not None:
        return cached

    t0 = time.monotonic()
    logger.info(f"[ethereum] BFS node: {address[:10]}... depth={depth} [{start_block}->{end_block}]")

    chunks = _make_block_chunks(start_block, end_block, BFS_CHUNK_COUNT)

    if depth == 0:
        if seed_normal is not None and seed_internal is not None and seed_token is not None:
            raw_normal, raw_internal, raw_token = seed_normal, seed_internal, seed_token
        else:
            # Seed wallet: fetch a reasonable number of recent transactions to build a graph
            # 100 is enough for a dashboard view without causing timeouts.
            raw_normal, raw_internal, raw_token = await asyncio.gather(
                _fetch_paged(address, "txlist", 100),
                _fetch_paged(address, "txlistinternal", 100),
                _fetch_paged(address, "tokentx", 100),
                return_exceptions=True,
            )
    else:
        # Counterparty wallet: use paged fetcher with strict limit (speed priority)
        # We only need a few connections to build the graph layer.
        raw_normal = await _fetch_paged(address, "txlist", limit=tx_limit)
        raw_internal = []
        raw_token = []

    def _safe_list(raw_results) -> List[Dict[str, Any]]:
        empty: List[Dict[str, Any]] = []
        if isinstance(raw_results, Exception):
            return empty
        if not raw_results:
            return empty
        # If it's a list of dicts (flat), just return it
        if isinstance(raw_results, list) and len(raw_results) > 0 and isinstance(raw_results[0], dict):
            return raw_results
        # Backwards compatibility in case it's a list of lists
        out: List[Dict[str, Any]] = []
        for r in raw_results:
            if isinstance(r, list):
                out.extend(r)
        return _dedup_and_sort(out, sort_desc=False)

    normal_txs = _safe_list(raw_normal)
    internal_txs = _safe_list(raw_internal)
    token_txs = _safe_list(raw_token)

    edges: List[Dict[str, Any]] = []
    new_wallets: List[str] = []

    n_edges, n_wallets = _collect_normal_hops(normal_txs, tx_limit)
    i_edges, i_wallets = _collect_internal_hops(internal_txs, tx_limit)
    t_edges, t_wallets = _collect_token_hops(token_txs, tx_limit)

    edges.extend(n_edges)
    edges.extend(i_edges)
    edges.extend(t_edges)
    new_wallets.extend(n_wallets)
    new_wallets.extend(i_wallets)
    new_wallets.extend(t_wallets)

    logger.info(
        f"[ethereum] BFS node done: {address[:10]}... "
        f"{len(edges)} edges in {time.monotonic()-t0:.2f}s"
    )

    result = (edges, new_wallets)
    _bfs_cache_set(address, result)
    return result


async def bfs_wallet_hops(
    start_address: str,
    hop_limit: int = 1,
    tx_limit: int = 10,
    min_eth_value: float = MIN_ETH_VALUE,
    latest_block: Optional[int] = None,
    seed_normal: Optional[List[Dict[str, Any]]] = None,
    seed_internal: Optional[List[Dict[str, Any]]] = None,
    seed_token: Optional[List[Dict[str, Any]]] = None,
    page: int = 1,
) -> List[Dict[str, Any]]:
    """
    BFS traversal over wallet connections -- parallel depth-layer expansion.

    Performance improvements:
    - latest_block is accepted as parameter (not re-fetched every call)
    - Only queries last RECENT_BLOCKS_WINDOW blocks instead of full history
    - At most BFS_MAX_WALLETS_PER_HOP wallets expanded per layer
    - In-memory cache prevents re-processing the same address twice
    - All nodes at the same hop depth processed concurrently
    """
    address = start_address.lower()

    if latest_block is None:
        latest_block = await fetch_latest_block_number()

    start_block, end_block = _recent_block_range(latest_block)

    visited: Set[str] = set()
    all_edges: List[Dict[str, Any]] = []
    total_t0 = time.monotonic()

    current_layer: List[Tuple[str, int]] = [(address, 0)]

    while current_layer:
        to_process = [
            (addr, depth)
            for addr, depth in current_layer
            if addr not in visited and depth <= hop_limit
        ]
        if not to_process:
            break

        # Cap wallets per hop to prevent exponential explosion
        if len(to_process) > BFS_MAX_WALLETS_PER_HOP:
            logger.info(
                f"[ethereum] BFS hop cap: trimming {len(to_process)} "
                f"-> {BFS_MAX_WALLETS_PER_HOP} wallets at depth={to_process[0][1]}"
            )
            to_process = to_process[:BFS_MAX_WALLETS_PER_HOP]

        for addr, _ in to_process:
            visited.add(addr)

        logger.info(
            f"[ethereum] BFS layer depth={to_process[0][1]}, "
            f"nodes={len(to_process)}, processing in parallel"
        )
        layer_t0 = time.monotonic()

        # All nodes in this layer run concurrently.
        # Seed wallet (depth=0) gets a generous timeout because its complete history
        # is required for the main UI payload. Counterparties (depth>0) stay strict.
        async def _timed_node(addr: str, depth: int):
            timeout_val = BFS_NODE_TIMEOUT if depth > 0 else 30.0
            try:
                sn = seed_normal if depth == 0 else None
                si = seed_internal if depth == 0 else None
                st = seed_token if depth == 0 else None
                return await asyncio.wait_for(
                    _process_bfs_node(addr, start_block, end_block, tx_limit, depth, sn, si, st, page=page),
                    timeout=timeout_val,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    f"[ethereum] BFS node {addr[:10]}... timed out after {timeout_val}s — skipping"
                )
                return ([], [])

        layer_results = await asyncio.gather(
            *[_timed_node(addr, depth) for addr, depth in to_process],
            return_exceptions=True,
        )

        logger.info(
            f"[ethereum] BFS layer done in {time.monotonic()-layer_t0:.2f}s"
        )

        next_layer: List[Tuple[str, int]] = []
        for (addr, depth), result in zip(to_process, layer_results):
            if isinstance(result, Exception):
                logger.error(f"[ethereum] BFS node {addr[:10]}... failed: {result}")
                continue

            node_edges, new_wallets = result
            all_edges.extend(node_edges)

            if depth < hop_limit:
                for w in new_wallets:
                    if w and w not in visited:
                        next_layer.append((w, depth + 1))

        # Deduplicate next layer
        seen_next: Set[str] = set()
        deduped_next: List[Tuple[str, int]] = []
        for addr, depth in next_layer:
            if addr not in seen_next:
                seen_next.add(addr)
                deduped_next.append((addr, depth))

        current_layer = deduped_next

    logger.info(
        f"[ethereum] BFS complete: {len(all_edges)} total edges "
        f"in {time.monotonic()-total_t0:.2f}s"
    )
    return all_edges


# ---------------------------------------------------------------------------
# Graph builder -- converts BFS edge list -> ReactFlow-compatible graph
# ---------------------------------------------------------------------------

def build_graph(
    transactions: List[Dict[str, Any]],
    wallet_address: str,
) -> Dict[str, Any]:
    """
    Convert the flat BFS edge list into a {nodes, edges} graph structure
    compatible with the frontend ReactFlow renderer.
    """
    seen_nodes: Set[str] = set()
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    for tx in transactions:
        for addr_key in ("from", "to"):
            addr = (tx.get(addr_key) or "").lower()
            if addr and addr not in seen_nodes:
                seen_nodes.add(addr)
                nodes.append(
                    {
                        "id": addr,
                        "address": addr,
                        "is_contract": tx.get("is_contract", False),
                        "type": (
                            "contract"
                            if tx.get("is_contract", False)
                            else "normal"
                        ),
                        "is_center": addr == wallet_address.lower(),
                    }
                )

    for i, tx in enumerate(transactions):
        from_addr = (tx.get("from") or "").lower()
        to_addr = (tx.get("to") or "").lower() if tx.get("to") else None
        if not from_addr or not to_addr:
            continue
        edge_id = tx.get("hash") or f"edge-{i}"
        edges.append(
            {
                "id": edge_id,
                "from": from_addr,
                "to": to_addr,
                "value": tx.get("value", "0"),
                "type": tx.get("type", "eth"),
                "hash": tx.get("hash", ""),
                "time": tx.get("time", ""),
                "token_symbol": tx.get("token_symbol"),
                "token_contract": tx.get("token_contract"),
            }
        )

    logger.debug(
        f"[ethereum] build_graph: {len(nodes)} nodes, {len(edges)} edges"
    )
    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Main wallet analysis -- all tasks in one asyncio.gather
# ---------------------------------------------------------------------------

async def analyze_wallet(
    address: str,
    hops: int = 1,
    tx_limit: int = 50,
    page: int = 1,
) -> Dict[str, Any]:
    """
    Orchestrates the analysis of an Ethereum wallet.
    Returns: {
        wallet, balance, transaction_count,
        transactions: [],
        graph: { nodes, edges },
        ...
    }
    """
    return await ethereum_wallet_info(address, hops, tx_limit, page)


async def ethereum_wallet_info(
    address: str,
    hops: int = 0,
    tx_limit: int = 50,
    page: int = 1,
) -> Dict[str, Any]:
    """
    Orchestrates a full wallet analysis -- optimized for <5s response.

    Performance strategy:
    1. Fetch latest block ONCE -- passed to all sub-functions
    2. Compute recent window [latest-200k, latest] -- skip full history
    3. Fire all tasks concurrently: balance, contract check, 3 tx types, BFS
    4. BFS capped at BFS_MAX_WALLETS_PER_HOP wallets per layer
    5. In-memory cache prevents re-fetching repeated addresses in BFS
    """
    address = address.lower()
    total_t0 = time.monotonic()
    logger.info(f"[ethereum] === Analysis start: {address} hops={hops} limit={tx_limit} page={page} ===")

    # Step 0: Fast-path for hops=0 (Quick Analysis)
    if hops == 0:
        logger.info(f"[ethereum] hops=0 — fast-path: quick analysis")
        # For quick analysis, we fetch balance, count, AND txs up to tx_limit
        # to compute risk score and connected wallets.
        fetch_limit = max(tx_limit, 50)
        balance, is_contract, total_tx_count, outgoing_count, top_txs = await asyncio.gather(
            fetch_balance(address),
            is_smart_contract(address),
            _fetch_total_count(address, "txlist"),
            fetch_transaction_count(address),
            _fetch_paged(address, "txlist", limit=fetch_limit, page=page),
            return_exceptions=True,
        )
        def _safe(val, default):
            return val if not isinstance(val, Exception) else default
            
        bal_val = float(_safe(balance, 0.0))
        isc_val = bool(_safe(is_contract, False))
        txs_val = _safe(top_txs, [])
        total_val = _safe(total_tx_count, 0)
        out_val = _safe(outgoing_count, 0)
        in_val = max(0, total_val - out_val)

        # Compute quick risk and connected count
        risk_score, risk_flags = compute_risk_score([], address, isc_val) # No BFS edges yet
        unique_connected = len(set(
            (t.get("from") or "").lower() for t in txs_val if (t.get("from") or "").lower() != address
        ) | set(
            (t.get("to") or "").lower() for t in txs_val if (t.get("to") or "").lower() != address
        ))

        return {
            "wallet": address,
            "currency": "ETH",
            "balance": bal_val,
            "is_smart_contract": isc_val,
            "transaction_count": total_val,
            "incoming_count": in_val,
            "outgoing_count": out_val,
            "internal_transaction_count": 0,
            "token_transaction_count": 0,
            "hops": 0,
            "tx_limit": int(tx_limit),
            "page": int(page),
            "transactions": txs_val[:tx_limit], # Return the first N as requested
            "graph": {"nodes": [], "edges": []},
            "risk_score": risk_score,
            "risk_flags": risk_flags,
            "connected_wallets_count": unique_connected,
        }

    # Step 1: Fetch latest block once -- shared across ALL subsequent calls
    latest_block = await fetch_latest_block_number()
    start_block, end_block = _recent_block_range(latest_block)
    logger.info(
        f"[ethereum] Block window: [{start_block} -> {end_block}] "
        f"({end_block - start_block:,} blocks = last {RECENT_BLOCKS_WINDOW:,} blocks)"
    )

    # Step 2: Fire primary tasks concurrently.
    # We use _fetch_paged here instead of _fetch_with_fallback because:
    # 1. It respects the tx_limit requested by the user.
    # 2. It's significantly faster for high-volume wallets (no pagination splits).
    # 3. Dashboard users typically only care about recent transactions.
    (
        balance,
        is_contract,
        total_tx_count,
        raw_txs,
        internal_txs,
        token_txs,
    ) = await asyncio.gather(
        fetch_balance(address),
        is_smart_contract(address),
        fetch_transaction_count(address),
        _fetch_paged(address, "txlist", limit=tx_limit, page=page),
        _fetch_paged(address, "txlistinternal", limit=tx_limit, page=page),
        _fetch_paged(address, "tokentx", limit=tx_limit, page=page),
        return_exceptions=True,
    )

    def _safe(val, default):
        if isinstance(val, Exception):
            logger.error(f"[ethereum] Parallel task failed: {val!r}")
            return default
        return val

    balance = _safe(balance, 0.0)
    is_contract = _safe(is_contract, False)
    total_tx_count = _safe(total_tx_count, 0)
    raw_txs = _safe(raw_txs, [])
    internal_txs = _safe(internal_txs, [])
    token_txs = _safe(token_txs, [])

    # Calculate true total incoming/outgoing counts via fast linear scan
    # total_outgoing = Nonce (exact for EOA)
    # total_incoming = Scanned from history
    total_inc, total_out = await asyncio.gather(
        _fetch_total_count(address, "txlist"),  # This gets all, we need to filter later or just use as total
        fetch_transaction_count(address),       # Nonce
        return_exceptions=True
    )
    total_inc = _safe(total_inc, 0)
    total_out = _safe(total_out, 0)
    
    # Step 3: Run BFS traversal using the already-fetched seed data.
    bfs_edges = await bfs_wallet_hops(
        address,
        hops,
        tx_limit,
        latest_block=latest_block,
        seed_normal=raw_txs,
        seed_internal=internal_txs,
        seed_token=token_txs,
        page=page,
    )

    total_elapsed = time.monotonic() - total_t0
    logger.info(
        f"[ethereum] === Analysis complete: {address} ===\n"
        f"  Normal txs      : {len(raw_txs)}\n"
        f"  Internal txs    : {len(internal_txs)}\n"
        f"  Token transfers : {len(token_txs)}\n"
        f"  BFS edges       : {len(bfs_edges)}\n"
        f"  Total time      : {total_elapsed:.2f}s"
    )

    # Step 3: Batch contract check for BFS counterparties
    unique_addrs = list({
        (e.get("from") or "").lower()
        for e in bfs_edges
        if e.get("from")
    } | {
        (e.get("to") or "").lower()
        for e in bfs_edges
        if e.get("to")
    })
    unique_addrs = [a for a in unique_addrs if a and a != address]

    contract_map: Dict[str, bool] = {}
    if unique_addrs:
        logger.info(f"[ethereum] Batch contract check: {len(unique_addrs)} addresses")
        contract_map = await batch_is_contract(unique_addrs)
    contract_map[address] = bool(is_contract)

    # Step 4: Compute backend risk score
    risk_score, risk_flags = compute_risk_score(bfs_edges, address, bool(is_contract))

    # Step 5: Format BFS edges for frontend
    formatted: List[Dict[str, Any]] = []
    for edge in bfs_edges:
        from_addr = (edge.get("from") or "").lower()
        to_addr = (edge.get("to") or "").lower() if edge.get("to") else None
        formatted.append(
            {
                "type": edge.get("type", "eth"),
                "from": from_addr,
                "to": to_addr,
                "value": edge.get("value", "0"),
                "time": edge.get("time", ""),
                "chain": edge.get("chain", "ethereum"),
                "hash": edge.get("hash", ""),
                "token_symbol": edge.get("token_symbol"),
                "token_contract": edge.get("token_contract"),
                "is_contract": contract_map.get(to_addr or "", False),
            }
        )

    # Step 6: Build graph structure
    graph = build_graph(formatted, address)

    # Step 7: Combine seed transactions for the table explorer
    def _to_eth(wei_str):
        try:
            return str(float(wei_str or 0) / 1e18)
        except:
            return "0"

    seed_explorer_txs = []
    
    # Add normal txs
    for tx in raw_txs:
        tx_copy = dict(tx)
        tx_copy["type"] = "normal"
        tx_copy["value"] = _to_eth(tx.get("value"))
        # Convert unix timestamp to ISO string for frontend parsing
        ts = tx.get("timeStamp")
        if ts:
            tx_copy["time"] = datetime.fromtimestamp(int(ts)).isoformat()
        seed_explorer_txs.append(tx_copy)
        
    # Add internal txs
    for tx in internal_txs:
        tx_copy = dict(tx)
        tx_copy["type"] = "internal"
        tx_copy["value"] = _to_eth(tx.get("value"))
        ts = tx.get("timeStamp")
        if ts:
            tx_copy["time"] = datetime.fromtimestamp(int(ts)).isoformat()
        seed_explorer_txs.append(tx_copy)
        
    # Add token txs
    for tx in token_txs:
        tx_copy = dict(tx)
        tx_copy["type"] = "token"
        tx_copy["value"] = _to_eth(tx.get("value")) 
        ts = tx.get("timeStamp")
        if ts:
            tx_copy["time"] = datetime.fromtimestamp(int(ts)).isoformat()
        seed_explorer_txs.append(tx_copy)
        
    # Sort by time descending
    seed_explorer_txs.sort(key=lambda x: int(x.get("timeStamp", 0)), reverse=True)

    final_elapsed = time.monotonic() - total_t0
    logger.info(f"[ethereum] === Total wall-clock time: {final_elapsed:.2f}s ===")

    return {
        "wallet": address,
        "currency": "ETH",
        "balance": float(balance),
        "is_smart_contract": bool(is_contract),
        "transaction_count": total_inc, # Total txs (approx)
        "incoming_count": total_inc - total_out if total_inc > total_out else 0,
        "outgoing_count": total_out,
        "internal_transaction_count": len(internal_txs),
        "token_transaction_count": len(token_txs),
        "hops": int(hops),
        "tx_limit": int(tx_limit),
        "page": int(page),
        "transactions": seed_explorer_txs[:tx_limit],
        "graph": graph,
        "risk_score": risk_score,
        "risk_flags": risk_flags,
    }
