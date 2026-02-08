# import requests
# import time
# from datetime import datetime, timezone
# from collections import deque

# ETHERSCAN_API_KEY = "XEKQ25UDD4ZTHVXQF5PQFSIGF6X8BU3DF3"
# ETHERSCAN_URL = "https://api.etherscan.io/v2/api"
# CHAIN_ID_ETHEREUM = 1


# def fetch_transactions(address: str) -> list:
#     params = {
#         "chainid": CHAIN_ID_ETHEREUM,
#         "module": "account",
#         "action": "txlist",
#         "address": address,
#         "startblock": 0,
#         "endblock": 99999999,
#         "sort": "asc",
#         "apikey": ETHERSCAN_API_KEY
#     }

#     try:
#         resp = requests.get(ETHERSCAN_URL, params=params, timeout=15)
#         resp.raise_for_status()
#         data = resp.json()
#     except Exception:
#         return []

#     if data.get("status") != "1":
#         return []

#     return data.get("result", [])


# def bfs_wallet_hops(
#     start_address: str,
#     hop_limit: int = 1,
#     tx_limit: int = 10,
#     min_eth_value: float = 0.001
# ) -> list:
#     visited = set()
#     results = []
#     queue = deque([(start_address.lower(), 0)])

#     while queue:
#         current_wallet, depth = queue.popleft()

#         if current_wallet in visited or depth > hop_limit:
#             continue

#         visited.add(current_wallet)

#         txs = fetch_transactions(current_wallet)
#         if not txs:
#             continue

#         txs = txs[: tx_limit * 4]
#         hop_tx_count = 0

#         for tx in txs:
#             if tx.get("isError") != "0":
#                 continue

#             # skip contract interactions
#             if tx.get("input") != "0x":
#                 continue

#             from_addr = tx.get("from", "").lower()
#             to_addr = tx.get("to").lower() if tx.get("to") else None

#             eth_value = int(tx.get("value", "0")) / 10**18
#             if eth_value < min_eth_value:
#                 continue

#             timestamp = datetime.fromtimestamp(
#                 int(tx["timeStamp"]),
#                 tz=timezone.utc
#             ).isoformat()

#             results.append({
#                 "chain": "ethereum",
#                 "hop": depth,
#                 "from": from_addr,
#                 "to": to_addr,
#                 "value_eth": eth_value,
#                 "timestamp": timestamp,
#                 "tx_hash": tx["hash"]
#             })

#             hop_tx_count += 1

#             if depth < hop_limit:
#                 if from_addr and from_addr not in visited:
#                     queue.append((from_addr, depth + 1))
#                 if to_addr and to_addr not in visited:
#                     queue.append((to_addr, depth + 1))

#             if hop_tx_count >= tx_limit:
#                 break

#         time.sleep(0.2)

#     return results

import requests
import time
from datetime import datetime, timezone
from collections import deque

ETHERSCAN_API_KEY = "XEKQ25UDD4ZTHVXQF5PQFSIGF6X8BU3DF3"
ETHERSCAN_URL = "https://api.etherscan.io/v2/api"
CHAIN_ID_ETHEREUM = 1


def fetch_transactions(address: str) -> list:
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "account",
        "action": "txlist",
        "address": address,
        "startblock": 0,
        "endblock": 99999999,
        "sort": "asc",
        "apikey": ETHERSCAN_API_KEY
    }

    try:
        resp = requests.get(ETHERSCAN_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    if data.get("status") != "1":
        return []

    return data.get("result", [])


def fetch_balance(address: str) -> float:
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "account",
        "action": "balance",
        "address": address,
        "tag": "latest",
        "apikey": ETHERSCAN_API_KEY
    }

    try:
        resp = requests.get(ETHERSCAN_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if "result" not in data:
            print("Balance API error:", data)
            return 0.0

        balance_wei = int(data["result"])
        balance_eth = balance_wei / 10**18

        print(f"Balance fetched for {address}: {balance_eth} ETH")
        return balance_eth

    except requests.exceptions.RequestException as e:
        print("Network/API error while fetching balance:", e)
        return 0.0

    except ValueError as e:
        print("Invalid balance value:", e)
        return 0.0


def is_smart_contract(address: str) -> bool:
    params = {
        "chainid": CHAIN_ID_ETHEREUM,
        "module": "proxy",
        "action": "eth_getCode",
        "address": address,
        "tag": "latest",
        "apikey": ETHERSCAN_API_KEY
    }

    try:
        resp = requests.get(ETHERSCAN_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        code = data.get("result")
        
        # "0x" = empty code = EOA (not a contract)
        # "0x" + hex = has code = smart contract
        is_contract = code not in ("0x", "0x0", None, "")
        return is_contract
        
    except Exception as e:
        print(f"is_smart_contract error for {address}: {e}")
        return False


def bfs_wallet_hops(
    start_address: str,
    hop_limit: int = 1,
    tx_limit: int = 10,
    min_eth_value: float = 0.001
) -> list:
    visited = set()
    results = []
    queue = deque([(start_address.lower(), 0)])

    while queue:
        current_wallet, depth = queue.popleft()

        if current_wallet in visited or depth > hop_limit:
            continue

        visited.add(current_wallet)

        txs = fetch_transactions(current_wallet)
        if not txs:
            continue

        txs = txs[: tx_limit * 4]
        hop_tx_count = 0

        for tx in txs:
            if tx.get("isError") != "0":
                continue

            # skip contract interactions
            if tx.get("input") != "0x":
                continue

            from_addr = tx.get("from", "").lower()
            to_addr = tx.get("to").lower() if tx.get("to") else None

            eth_value = int(tx.get("value", "0")) / 10**18
            if eth_value < min_eth_value:
                continue

            timestamp = datetime.fromtimestamp(
                int(tx["timeStamp"]),
                tz=timezone.utc
            ).isoformat()

            results.append({
                "chain": "ethereum",
                "from": from_addr,
                "to": to_addr,
                "value_eth": eth_value,
                "timestamp": timestamp,
                "tx_hash": tx["hash"]
            })

            hop_tx_count += 1

            if depth < hop_limit:
                if from_addr and from_addr not in visited:
                    queue.append((from_addr, depth + 1))
                if to_addr and to_addr not in visited:
                    queue.append((to_addr, depth + 1))

            if hop_tx_count >= tx_limit:
                break

        time.sleep(0.2)

    return results


def get_wallet_data(address: str) -> dict:
    address = address.lower()

    transactions = fetch_transactions(address)
    balance = fetch_balance(address)
    smart_contract = is_smart_contract(address)

    formatted_txs = []
    for tx in transactions:
        formatted_txs.append({
            "hash": tx.get("hash"),
            "from": tx.get("from"),
            "to": tx.get("to"),
            "value_eth": int(tx.get("value", "0")) / 10**18,
            "timestamp": datetime.fromtimestamp(
                int(tx["timeStamp"]),
                tz=timezone.utc
            ).isoformat()
        })

    return {
        "wallet": address,
        "currency": "ETH",
        "is_smart_contract": smart_contract,
        "transaction_count": len(transactions),
        "balance": balance,
        "transactions": formatted_txs,
        "hops": 0
    }

def ethereum_wallet_info(address: str, hops: int = 1, tx_limit: int = 10) -> dict:
    """
    Return a standardized wallet summary matching frontend expectations:
      - wallet, currency, balance, is_smart_contract
      - transaction_count (raw txs), hops, tx_limit
      - transactions: list of rows with keys: from, to, time, chain, hash, value
    """
    address = address.lower()

    balance = fetch_balance(address) if "fetch_balance" in globals() else 0
    is_contract = is_smart_contract(address) if "is_smart_contract" in globals() else False
    raw_txs = fetch_transactions(address) or [] if "fetch_transactions" in globals() else []
    bfs_txs = bfs_wallet_hops(address, hops, tx_limit) or [] if "bfs_wallet_hops" in globals() else []

    def fmt_time(ts):
        if ts is None:
            return ""
        try:
            t = int(ts)
            return datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
        except Exception:
            return str(ts)

    def fmt_value(v):
        if v is None:
            return "0"
        try:
            # prefer already-in-ETH value (float), else treat as wei int string
            if isinstance(v, (float, int)):
                return str(float(v))
            s = str(v)
            if "." in s:
                return s
            # assume wei
            return str(int(s) / 10**18)
        except Exception:
            return str(v)

    formatted = []
    for tx in bfs_txs:
        h = tx.get("tx_hash") or tx.get("hash") or tx.get("transactionHash")
        ts = tx.get("timestamp") or tx.get("timeStamp") or tx.get("time")
        val = tx.get("value_eth") or tx.get("value")
        formatted.append({
            "from": tx.get("from") or tx.get("sender") or "",
            "to": tx.get("to") or tx.get("recipient") or "",
            "time": fmt_time(ts),
            "chain": (tx.get("chain") or "ethereum").lower(),
            "hash": h or "",
            "value": fmt_value(val),
        })

    return {
        "wallet": address,
        "currency": "ETH",
        "balance": float(balance or 0.0),
        "is_smart_contract": bool(is_contract),
        "transaction_count": len(raw_txs),
        "hops": int(hops),
        "tx_limit": int(tx_limit),
        "transactions": formatted
    }
