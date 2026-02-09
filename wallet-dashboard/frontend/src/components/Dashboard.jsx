import { Search, ArrowRightLeft } from 'lucide-react'

export default function Dashboard({ address, setAddress, hops, setHops, data, loading, onScan, onGraph }) {
  return (
    <div className="p-10 max-w-7xl mx-auto">
      {/* Search Bar */}
      <div className="flex justify-center mb-12">
        <div className="flex w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-3xl overflow-hidden">
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            className="flex-1 bg-transparent px-8 py-5 text-lg font-mono focus:outline-none"
            placeholder="0x..."
          />
          <button
            onClick={onScan}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold px-12 py-5 flex items-center gap-3"
          >
            <Search size={22} /> {loading ? 'SCANNING...' : 'SCAN'}
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-6 mb-12">
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-8">
              <div className="text-emerald-400 text-sm uppercase tracking-widest mb-2">TOTAL BALANCE</div>
              <div className="text-5xl font-bold">{data.balance.toFixed(4)} {data.currency}</div>
            </div>
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-8">
              <div className="text-emerald-400 text-sm uppercase tracking-widest mb-2">TRANSACTIONS</div>
              <div className="text-5xl font-bold">{data.transaction_count}</div>
            </div>
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-8">
              <div className="text-emerald-400 text-sm uppercase tracking-widest mb-2">ACTIVE CHAINS</div>
              <div className="text-5xl font-bold">1</div>
            </div>
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-3xl p-8">
              <div className="text-emerald-400 text-sm uppercase tracking-widest mb-2">RISK SCORE</div>
              <div className="text-5xl font-bold text-emerald-400">LOW</div>
            </div>
          </div>

          {/* Wallet Summary - SINGLE DYNAMIC ROW + FULL ADDRESS */}
          <div className="mb-12">
            <div className="text-emerald-400 text-2xl font-bold mb-6">► WALLET SUMMARY</div>
            <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-700">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-zinc-500 border-b border-zinc-700">
                    <th className="px-8 py-6">WALLET ADDRESS</th>
                    <th className="px-8 py-6">CURRENCY</th>
                    <th className="px-8 py-6">SMART CONTRACT</th>
                    <th className="px-8 py-6">TRANSACTIONS (I/O)</th>
                    <th className="px-8 py-6">FINAL BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="px-8 py-6 font-mono break-all text-emerald-400">{data.wallet}</td>
                    <td className="px-8 py-6">{data.currency}</td>
                    <td className="px-8 py-6">
                      {data.is_smart_contract ? 
                        <span className="bg-emerald-500/20 text-emerald-400 px-5 py-1 rounded-full text-xs">Yes</span> : 
                        <span className="bg-red-500/20 text-red-400 px-5 py-1 rounded-full text-xs">No</span>}
                    </td>
                    <td className="px-8 py-6 font-mono">{data.transaction_count}</td>
                    <td className="px-8 py-6 font-bold text-white">{data.balance.toFixed(4)} {data.currency}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Transaction Log - FULL ADDRESSES */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <div className="text-emerald-400 text-2xl font-bold">► TRANSACTION LOG</div>
              <div className="flex items-center gap-8">
                <div>
                  <span className="text-xs uppercase tracking-widest text-zinc-500">HOP COUNT</span>
                  <select value={hops} onChange={e => setHops(Number(e.target.value))} className="bg-zinc-900 border border-zinc-700 ml-4 px-6 py-2 rounded-2xl">
                    {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button onClick={onGraph} className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold px-12 py-4 rounded-2xl flex items-center gap-3">
                  SHOW GRAPH <ArrowRightLeft size={20} />
                </button>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-700 overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-zinc-500 border-b border-zinc-700">
                    <th className="px-8 py-6">FROM ADDRESS</th>
                    <th className="px-8 py-6">TO ADDRESS</th>
                    <th className="px-8 py-6">TIMESTAMP</th>
                    <th className="px-8 py-6">CURRENCY</th>
                    <th className="px-8 py-6">TRANSACTION HASH</th>
                    <th className="px-8 py-6">VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx, i) => (
                    <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="px-8 py-6 font-mono break-all">{tx.from}</td>
                      <td className="px-8 py-6 font-mono break-all">{tx.to}</td>
                      <td className="px-8 py-6 text-zinc-400">{new Date(tx.time).toLocaleString('en-GB')}</td>
                      <td className="px-8 py-6">{tx.chain.toUpperCase()}</td>
                      <td className="px-8 py-6 font-mono text-emerald-400">{tx.hash}</td>
                      <td className="px-8 py-6 font-bold text-emerald-400">{parseFloat(tx.value).toFixed(4)} {data.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}