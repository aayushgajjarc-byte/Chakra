import { useState } from "react";
import { useNavigate } from "react-router-dom";
import WalletSummary from "../components/WalletSummary";
import TransactionTable from "../components/TransactionsTable";
import HopSelector from "../components/HopSelector";
import { fetchWalletData } from "../api/api";

export default function Dashboard() {
  const [address, setAddress] = useState("");
  const [hop, setHop] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const load = async () => {
    if (!address) return;

    setLoading(true);
    try {
      const result = await fetchWalletData(address, hop, 5);
      console.log("API RESULT:", result); // useful for debugging
      setData(result);
    } catch (err) {
      console.error("Failed to fetch wallet data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        placeholder="ENTER WALLET ADDRESS"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />

      <button onClick={load} disabled={loading}>
        {loading ? "ANALYZING..." : "ANALYZE"}
      </button>

      {data && (
        <>
          {/* Adapt backend response → WalletSummary */}
          <WalletSummary data = {data} />

          <TransactionTable rows={data.transactions} />

          <HopSelector
            hop={hop}
            setHop={(value) => setHop(Number(value))}
          />

          <button
            onClick={() =>
              nav("/graph", {
                state: { transactions: data.transactions },
              })
            }
          >
            SHOW GRAPH
          </button>
        </>
      )}
    </>
  );
}

