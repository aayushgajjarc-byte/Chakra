import requests
import argparse
import time
from datetime import datetime, timezone
from collections import deque

ETHERSCAN_API_KEY = "XEKQ25UDD4ZTHVXQF5PQFSIGF6X8BU3DF3"
ETHERSCAN_URL = "https://api.etherscan.io/v2/api"


def fetch_transactions(address):
    params = {
        "chainid": 1,
        "module": "account",
        "action": "txlist",
        "address": address,
        "startblock": 0,
        "endblock": 99999999,
        "sort": "asc",
        "apikey": ETHERSCAN_API_KEY
    }

    resp = requests.get(ETHERSCAN_URL, params=params)
    data = resp.json()

    print(f"[DEBUG] API response for {address}:")
    print(data)

    if data.get("status") != "1":
        print(f"[WARN] No transactions or API error for {address}")
        return []

    return data["result"]



# def bfs_wallet_hops(start_address, hop_limit, tx_limit):

#     visited = set()
#     results = []
#     queue = deque([(start_address.lower(), 0)])

#     while queue:
#         current_wallet, depth = queue.popleft()

#         if current_wallet in visited or depth > hop_limit:
#             continue

#         visited.add(current_wallet)

#         txs = fetch_transactions(current_wallet)
#         txs = [tx for tx in txs if tx["input"] == "0x"]
#         txs = txs[:tx_limit]
#         time.sleep(0.2)  # API rate-limit safety

#         for tx in txs:
#             from_addr = tx["from"].lower()
#             to_addr = tx["to"].lower() if tx["to"] else None

#             eth_value = int(tx["value"]) / 10**18
#             timestamp = int(tx["timeStamp"])

#             results.append({
#                 "hop": depth,
#                 "tx_hash": tx["hash"],
#                 "from": from_addr,
#                 "to": to_addr,
#                 "value_eth": eth_value,
#                 "timestamp": timestamp,
#                 "block": tx["blockNumber"]
#             })

#             if from_addr not in visited:
#                 queue.append((from_addr, depth + 1))
#             if to_addr and to_addr not in visited:
#                 queue.append((to_addr, depth + 1))

#     return results



def bfs_wallet_hops(start_address, hop_limit, tx_limit):
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

        # Pull extra txs so filters don’t starve us
        txs = txs[: tx_limit * 4]

        hop_tx_count = 0

        for tx in txs:
            # ─────────────── Filters ───────────────

            # Skip failed transactions
            if tx.get("isError") != "0":
                continue

            # Skip contract calls (EOA-only ETH transfers)
            if tx.get("input") != "0x":
                continue

            from_addr = tx["from"].lower()
            to_addr = tx["to"].lower() if tx.get("to") else None

            eth_value = int(tx["value"]) / 10**18

            # Skip dust
            if eth_value < 0.001:
                continue

            # Convert timestamp safely (NON-deprecated)
            ts_utc = datetime.fromtimestamp(
                int(tx["timeStamp"]),
                tz=timezone.utc
            ).isoformat()

            results.append({
                "hop": depth,
                "from": from_addr,
                "to": to_addr,
                "value_eth": eth_value,
                "timestamp": ts_utc,
                "tx_hash": tx["hash"]
            })

            hop_tx_count += 1

            # BFS expansion
            if depth < hop_limit:
                if from_addr not in visited:
                    queue.append((from_addr, depth + 1))
                if to_addr and to_addr not in visited:
                    queue.append((to_addr, depth + 1))

            # Enforce tx limit per hop
            if hop_tx_count >= tx_limit:
                break

    return results



def main():
    parser = argparse.ArgumentParser(description="Ethereum Wallet Transaction Mapper")
    parser.add_argument("--address", required=True, help="Ethereum wallet address")
    parser.add_argument("--hops", type=int, default=1, help="Hop limit")
    parser.add_argument("--limit", type=int, default=5, help="Limit transactions per wallet")

    args = parser.parse_args()

    results = bfs_wallet_hops(args.address, args.hops,args.limit)

    for r in results:
        print(
            f"[HOP {r['hop']}] {r['from']} -> {r['to']} | "
            f"{r['value_eth']} ETH | {r['tx_hash']}"
        )


if __name__ == "__main__":
    main()
