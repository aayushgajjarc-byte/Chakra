"""
models/schemas.py -- Pydantic v2 response schemas for the CHAKRA API.

All API endpoints return instances of these models, ensuring:
  - Automatic JSON serialization
  - OpenAPI / Swagger docs generation
  - Runtime type validation of returned data
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Transaction record -- supports eth, contract, internal, and ERC-20 types
# ---------------------------------------------------------------------------

class Transaction(BaseModel):
    """A single transfer edge in the transaction graph."""

    # Transaction category -- determines how it is rendered in the graph
    type: str = Field(
        default="eth",
        description="One of: 'eth', 'contract', 'internal', 'erc20'",
    )

    # Participants
    from_address: str = Field(alias="from", default="")
    to_address: Optional[str] = Field(alias="to", default=None)

    # Value expressed as a decimal string (ETH or token units)
    value: str = Field(default="0")

    # ISO-8601 timestamp
    time: str = Field(default="")

    # Transaction / trace hash
    hash: str = Field(default="")

    # Chain identifier (always "ethereum" for now)
    chain: str = Field(default="ethereum")

    # ERC-20 specific fields (empty for eth / internal)
    token_symbol: Optional[str] = Field(default=None)
    token_contract: Optional[str] = Field(default=None)

    # Whether the counterparty address is a smart contract
    is_contract: bool = Field(default=False)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Graph node and edge shapes (used by frontend ReactFlow)
# ---------------------------------------------------------------------------

class GraphNode(BaseModel):
    """A wallet or contract address rendered as a node in the graph."""

    address: str
    balance: float = 0.0
    is_contract: bool = False
    label: Optional[str] = None
    tx_count: int = 0
    risk_score: int = 0


class GraphEdge(BaseModel):
    """A directed fund-flow edge between two graph nodes."""

    from_address: str = Field(alias="from")
    to_address: str = Field(alias="to")
    value: str
    tx_hash: str
    tx_type: str = "eth"
    token_symbol: Optional[str] = None

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Risk analytics summary
# ---------------------------------------------------------------------------

class RiskSummary(BaseModel):
    """Computed risk metrics returned alongside each wallet analysis."""

    # Overall score 0-100
    risk_score: int = Field(default=0, ge=0, le=100)

    # Human-readable flags explaining the score
    risk_flags: List[str] = Field(default_factory=list)

    # Per-counterparty breakdown (top 5)
    high_risk_counterparties: List[Dict[str, Any]] = Field(default_factory=list)

    # Statistically anomalous transactions
    suspicious_tx_hashes: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Top-level wallet analysis response
# ---------------------------------------------------------------------------

class WalletAnalysisResponse(BaseModel):
    """
    Primary response schema for /api/wallet/analyze and /api/v1/dashboard.

    Backward-compatible with the original response structure so the existing
    frontend works without modification.
    """

    # Core wallet identity
    wallet: str
    currency: str = "ETH"
    balance: float = 0.0
    is_smart_contract: bool = False

    # Transaction counts (displayed in SummaryCards)
    transaction_count: int = 0
    internal_transaction_count: int = 0
    token_transaction_count: int = 0

    # BFS parameters echoed back
    hops: int = 1
    tx_limit: int = 10

    # The main transaction list used by both the table and the graph
    transactions: List[Transaction] = Field(default_factory=list)

    # ReactFlow-compatible graph structure -- nodes + edges derived from transactions.
    # Shape: {"nodes": [{"id": addr, "address": addr, "is_contract": bool, ...}],
    #          "edges": [{"id": hash, "from": addr, "to": addr, "type": str, ...}]}
    graph: Dict[str, Any] = Field(default_factory=lambda: {"nodes": [], "edges": []})

    # Backend-computed risk (replaces naive client-side heuristics)
    risk_score: int = Field(default=0, ge=0, le=100)
    risk_flags: List[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
