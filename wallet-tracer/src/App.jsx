import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import GraphView from './components/GraphView'

const API = 'http://localhost:8000'

function App() {
  const [view, setView] = useState('dashboard')
  const [address, setAddress] = useState('0x6eb40eD52793Fb7ca5Cf7f17d48147299d49B70E')
  const [hops, setHops] = useState(1)
  const [limit, setLimit] = useState(10)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchWallet = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/dashboard?address=${address}&hops=${hops}&limit=${limit}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
      // fallback (remove after backend works)
      setData({
        wallet: address,
        currency: "ETH",
        balance: 2.345,
        is_smart_contract: false,
        transaction_count: 25,
        transactions: [
          { from: "0x1BvBMSE...", to: "0x3K98ah...", time: "2024-05-01T14:23:45Z", chain: "ethereum", hash: "0xa6b3c4d5...", value: "0.125" },
          { from: "0x1BvBMSE...", to: "0x3K98ah...", time: "2024-05-01T14:23:45Z", chain: "ethereum", hash: "0xa6b3c4d5...", value: "0.125" },
          { from: "0x1FfmbH...", to: "0x1A1zP1eP...", time: "2024-04-28T09:15:30Z", chain: "ethereum", hash: "0xf7e8d9c0...", value: "0.750" },
          { from: "0x3J98t1...", to: "0xbc1qar...", time: "2024-04-25T18:42:11Z", chain: "ethereum", hash: "0xb2c3d4e5...", value: "1.200" }
        ]
      })
    }
    setLoading(false)
  }

  useEffect(() => { if (data) fetchWallet() }, [hops, limit])

  return (
    <div className="min-h-screen bg-zinc-950">
      {view === 'dashboard' ? (
        <Dashboard
          address={address} setAddress={setAddress}
          hops={hops} setHops={setHops}
          data={data} loading={loading}
          onScan={fetchWallet}
          onGraph={() => setView('graph')}
        />
      ) : (
        <GraphView data={data} onBack={() => setView('dashboard')} />
      )}
    </div>
  )
}

export default App