# import requests
# import time
# from datetime import datetime, timezone
# from collections import deque
# # later: from chain.bitcoin import analyze_bitcoin_wallet
# from chain.detector import detect_chain
# from chain.ethereum import analyze_ethereum_wallet


# ETHERSCAN_API_KEY = "XEKQ25UDD4ZTHVXQF5PQFSIGF6X8BU3DF3"
# ETHERSCAN_URL = "https://api.etherscan.io/v2/api"


# def fetch_transactions(address: str):
#     params = {
#         "chainid": 1,
#         "module": "account",
#         "action": "txlist",
#         "address": address,
#         "startblock": 0,
#         "endblock": 99999999,
#         "sort": "asc",
#         "apikey": ETHERSCAN_API_KEY
#     }

#     resp = requests.get(ETHERSCAN_URL, params=params, timeout=15)
#     data = resp.json()

#     if data.get("status") != "1":
#         return []

#     return data["result"]


# def bfs_wallet_hops(start_address: str, hop_limit: int, tx_limit: int):
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

#             if tx.get("input") != "0x":
#                 continue

#             from_addr = tx["from"].lower()
#             to_addr = tx["to"].lower() if tx.get("to") else None

#             eth_value = int(tx["value"]) / 10**18
#             if eth_value < 0.001:
#                 continue

#             ts_utc = datetime.fromtimestamp(
#                 int(tx["timeStamp"]),
#                 tz=timezone.utc
#             ).isoformat()

#             results.append({
#                 "hop": depth,
#                 "from": from_addr,
#                 "to": to_addr,
#                 "value_eth": eth_value,
#                 "timestamp": ts_utc,
#                 "tx_hash": tx["hash"]
#             })

#             hop_tx_count += 1

#             if depth < hop_limit:
#                 if from_addr not in visited:
#                     queue.append((from_addr, depth + 1))
#                 if to_addr and to_addr not in visited:
#                     queue.append((to_addr, depth + 1))

#             if hop_tx_count >= tx_limit:
#                 break

#         time.sleep(0.2)  # rate-limit safety

#     #return results
#     return txs

# def analyze_wallet(input_value: str, hops: int):
#     chain, input_type = detect_chain(input_value)

#     if chain == "ethereum":
#         return analyze_ethereum_wallet(input_value, hops)

#     if chain == "bitcoin":
#         return {"error": "Bitcoin not implemented yet"}

#     return {"error": "Unknown input"}

from chain.detector import detect_chain
from chain.ethereum import ethereum_wallet_info


def analyze_wallet(input_value: str, hops: int, tx_limit: int = 10):
    chain, input_type = detect_chain(input_value)

    if chain == "ethereum" and input_type == "address":
        return ethereum_wallet_info(input_value, hops, tx_limit)

    if chain == "bitcoin":
        return {"error": "Bitcoin support not implemented yet"}

    return {"error": "Unsupported input"}
