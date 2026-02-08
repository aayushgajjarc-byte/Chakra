# from fastapi import FastAPI, Query
# from fastapi.middleware.cors import CORSMiddleware
# from wallet import bfs_wallet_hops
# from wallet import analyze_wallet

# app = FastAPI(
#     title="Ethereum Wallet Dashboard API",
#     version="1.0"
# )

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # tighten later
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# @app.get("/")
# def root():
#     return {"status": "API is running"}

# @app.get("/analyze/{input_value}")
# def analyze(input_value: str, hops: int = 1):
#     return analyze_wallet(input_value, hops)

# @app.get("/api/v1/dashboard")
# def wallet_dashboard(
#     address: str = Query(..., description="Ethereum wallet address"),
#     hops: int = Query(1, ge=0, le=3),
#     limit: int = Query(5, ge=1, le=20),
# ):
#     """
#     Returns all ETH transfer transactions related to a wallet
#     using BFS hop traversal.
#     """
#     transactions = bfs_wallet_hops(address, hops, limit)

#     return {
#         "wallet": address.lower(),
#         "hops": hops,
#         "tx_limit": limit,
#         "transaction_count": len(transactions),
#         "transactions": transactions
#     }

import json
import logging
from unittest import result
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from wallet import analyze_wallet

app = FastAPI(
    title="Ethereum Wallet Dashboard API",
    version="1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("wallet-dashboard")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

@app.get("/")
def root():
    return {"status": "API is running"}

@app.get("/analyze/{input_value}")
def analyze(input_value: str, hops: int = 1):
    return analyze_wallet(input_value, hops)

@app.get("/api/v1/dashboard")
def wallet_dashboard(
    address: str = Query(..., description="Ethereum wallet address"),
    hops: int = Query(1, ge=0, le=3),
    limit: int = Query(5, ge=1, le=20),
):
    """
    Returns wallet summary (balance, smart contract status) + transactions
    """
    # Get wallet data (balance, smart contract status, basic txs)
    result = analyze_wallet(address, hops, limit)
    try:
        logger.info("Outgoing /api/v1/dashboard response:\n%s", json.dumps(result, default=str, indent=2))
    except Exception:
        logger.info("Outgoing /api/v1/dashboard response (repr): %s", repr(result))
    return result
    
