import os
import logging
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne

logger = logging.getLogger("wallet-dashboard")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "chakra_dashboard")

class Database:
    client: AsyncIOMotorClient = None
    db = None

    async def connect(self):
        try:
            self.client = AsyncIOMotorClient(MONGO_URL)
            self.db = self.client[MONGO_DB_NAME]
            # Verify connection
            await self.client.admin.command('ping')
            logger.info(f"[db] MongoDB connected: {MONGO_URL}")
        except Exception as e:
            logger.error(f"[db] MongoDB connection failed: {e}")
            self.client = None
            self.db = None

    async def disconnect(self):
        if self.client:
            self.client.close()
            logger.info("[db] MongoDB disconnected")

    async def save_query(self, wallet_data: dict):
        if self.db is None:
            return
        
        try:
            query_record = {
                "address": wallet_data.get("wallet").lower(),
                "timestamp": datetime.now(timezone.utc),
                "data": wallet_data,
                "balance": wallet_data.get("balance"),
                "risk_score": wallet_data.get("risk_score"),
                "transaction_count": wallet_data.get("transaction_count"),
                "hops": wallet_data.get("hops"),
            }
            # Update if exists, or insert new
            await self.db.queries.update_one(
                {"address": query_record["address"]},
                {"$set": query_record},
                upsert=True
            )
            logger.info(f"[db] Saved query for {query_record['address']}")
        except Exception as e:
            logger.error(f"[db] Failed to save query: {e}")

    async def get_query_data(self, address: str):
        if self.db is None:
            return None
        try:
            record = await self.db.queries.find_one({"address": address.lower()})
            if record:
                logger.info(f"[db] Found cached result for {address}")
                data = dict(record.get("data") or {})
                timestamp = record.get("timestamp")
                if timestamp:
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=timezone.utc)
                    data["queried_at"] = timestamp.isoformat().replace("+00:00", "Z")
                return data
            return None
        except Exception as e:
            logger.error(f"[db] Failed to fetch query data: {e}")
            return None

    async def get_history(self, limit: int = 20):
        if self.db is None:
            return []
        
        try:
            cursor = self.db.queries.find().sort("timestamp", -1).limit(limit)
            history = await cursor.to_list(length=limit)
            # Convert ObjectId and datetime to string for JSON serialization
            for item in history:
                item["_id"] = str(item["_id"])
                item["timestamp"] = item["timestamp"].isoformat()
            return history
        except Exception as e:
            logger.error(f"[db] Failed to fetch history: {e}")
            return []

    async def replace_wallet_transactions(self, address: str, transactions: list, queried_at: str | None = None):
        if self.db is None:
            return
        try:
            addr = address.lower()
            await self.db.wallet_transactions.delete_many({"address": addr})
            if not transactions:
                return

            ops = []
            for idx, tx in enumerate(transactions):
                doc = {
                    "address": addr,
                    "position": idx + 1,  # 1-based rank in newest-first order
                    "tx": tx,
                    "queried_at": queried_at,
                    "created_at": datetime.now(timezone.utc),
                }
                tx_hash = (tx.get("hash") or "").lower()
                if tx_hash:
                    ops.append(
                        UpdateOne(
                            {"address": addr, "hash": tx_hash},
                            {"$set": {**doc, "hash": tx_hash}},
                            upsert=True,
                        )
                    )
                else:
                    ops.append(UpdateOne({"address": addr, "position": idx + 1}, {"$set": doc}, upsert=True))

            if ops:
                await self.db.wallet_transactions.bulk_write(ops, ordered=False)
            logger.info("[db] Saved %s wallet transactions for %s", len(transactions), addr)
        except Exception as e:
            logger.error(f"[db] Failed to save wallet transactions: {e}")

    def _normalize_tx_for_table(self, tx: dict) -> dict:
        """Normalize tx payload so frontend consistently gets ETH units + ISO time."""
        out = dict(tx or {})
        raw_value = out.get("value", "0")
        try:
            s = str(raw_value or "0").strip()
            if "." not in s:
                out["value"] = str(int(s) / 10**18)
            else:
                out["value"] = s
        except Exception:
            out["value"] = str(raw_value or "0")

        ts = out.get("timeStamp")
        if ts and not out.get("time"):
            try:
                out["time"] = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
            except Exception:
                pass
        return out

    async def get_wallet_transactions_page(self, address: str, page: int = 1, limit: int = 10):
        if self.db is None:
            return {"transactions": [], "total_count": 0}
        try:
            addr = address.lower()
            safe_page = max(1, int(page))
            safe_limit = max(1, int(limit))
            skip = (safe_page - 1) * safe_limit

            total_count = await self.db.wallet_transactions.count_documents({"address": addr})
            if total_count == 0:
                return {"transactions": [], "total_count": 0}

            cursor = (
                self.db.wallet_transactions
                .find({"address": addr}, {"tx": 1, "_id": 0})
                .sort("position", 1)
                .skip(skip)
                .limit(safe_limit)
            )
            rows = await cursor.to_list(length=safe_limit)
            txs = [self._normalize_tx_for_table(row.get("tx", {})) for row in rows]
            return {"transactions": txs, "total_count": int(total_count)}
        except Exception as e:
            logger.error(f"[db] Failed to fetch wallet transaction page: {e}")
            return {"transactions": [], "total_count": 0}

    async def get_normal_transaction_stats(self, address: str) -> dict:
        """
        Totals derived from persisted txlist archive (wallet_transactions).
        Matches the explorer table: incoming = rows where wallet is `to`,
        outgoing = rows where wallet is `from` (counts can overlap for edge cases).
        """
        if self.db is None:
            return {
                "transaction_count": 0,
                "incoming_count": 0,
                "outgoing_count": 0,
            }
        addr = address.lower()
        try:
            pipeline = [
                {"$match": {"address": addr}},
                {
                    "$project": {
                        "from_l": {"$toLower": {"$ifNull": ["$tx.from", ""]}},
                        "to_l": {"$toLower": {"$ifNull": ["$tx.to", ""]}},
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "transaction_count": {"$sum": 1},
                        "outgoing_count": {
                            "$sum": {"$cond": [{"$eq": ["$from_l", addr]}, 1, 0]}
                        },
                        "incoming_count": {
                            "$sum": {"$cond": [{"$eq": ["$to_l", addr]}, 1, 0]}
                        },
                    }
                },
            ]
            rows = (
                await self.db.wallet_transactions.aggregate(pipeline).to_list(length=1)
            )
            if not rows:
                return {
                    "transaction_count": 0,
                    "incoming_count": 0,
                    "outgoing_count": 0,
                }
            r = rows[0]
            return {
                "transaction_count": int(r.get("transaction_count", 0)),
                "incoming_count": int(r.get("incoming_count", 0)),
                "outgoing_count": int(r.get("outgoing_count", 0)),
            }
        except Exception as e:
            logger.error(f"[db] Failed to aggregate normal tx stats: {e}")
            return {
                "transaction_count": 0,
                "incoming_count": 0,
                "outgoing_count": 0,
            }

    async def get_connected_counterparty_count(self, address: str) -> int:
        """
        Distinct EOAs/contracts that appear as from or to on any archived normal tx,
        excluding the wallet itself — aligns with Transaction Explorer archive volume.
        """
        if self.db is None:
            return 0
        addr = address.lower()
        try:
            pipeline = [
                {"$match": {"address": addr}},
                {
                    "$project": {
                        "_id": 0,
                        "addrs": {
                            "$filter": {
                                "input": [
                                    {"$toLower": {"$ifNull": ["$tx.from", ""]}},
                                    {"$toLower": {"$ifNull": ["$tx.to", ""]}},
                                ],
                                "as": "a",
                                "cond": {
                                    "$and": [
                                        {"$gt": [{"$strLenCP": "$$a"}, 0]},
                                        {"$ne": ["$$a", addr]},
                                    ]
                                },
                            }
                        },
                    }
                },
                {"$unwind": "$addrs"},
                {"$group": {"_id": "$addrs"}},
                {"$count": "n"},
            ]
            rows = (
                await self.db.wallet_transactions.aggregate(pipeline).to_list(
                    length=1
                )
            )
            return int(rows[0]["n"]) if rows else 0
        except Exception as e:
            logger.error(f"[db] Failed to count connected counterparties: {e}")
            return 0

    async def clear_wallet_cache(self, address: str | None = None):
        """Clear cached query + transaction archive for one address or all."""
        if self.db is None:
            return {"queries_deleted": 0, "transactions_deleted": 0}
        try:
            if address:
                addr = address.lower()
                query_filter = {"address": addr}
                tx_filter = {"address": addr}
            else:
                query_filter = {}
                tx_filter = {}

            query_result = await self.db.queries.delete_many(query_filter)
            tx_result = await self.db.wallet_transactions.delete_many(tx_filter)
            logger.info(
                "[db] Cleared cache for %s (queries=%s txs=%s)",
                address.lower() if address else "ALL",
                query_result.deleted_count,
                tx_result.deleted_count,
            )
            return {
                "queries_deleted": int(query_result.deleted_count),
                "transactions_deleted": int(tx_result.deleted_count),
            }
        except Exception as e:
            logger.error(f"[db] Failed to clear wallet cache: {e}")
            return {"queries_deleted": 0, "transactions_deleted": 0}

db = Database()
