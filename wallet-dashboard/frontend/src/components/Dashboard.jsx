import { motion } from 'framer-motion'
import { useRef } from 'react'
import { Search, Activity, ShieldCheck, RefreshCw, Layers } from 'lucide-react'
import SummaryCards from './SummaryCards'
import TransactionsTable from './TransactionsTable'
import RiskAnalyticsPanel from './RiskAnalyticsPanel'

export default function Dashboard({
  address,
  setAddress,
  hops,
  setHops,
  limit,
  setLimit,
  data,
  loading,
  error,
  onScan,
  onPageChange,
}) {
  const overviewRef = useRef(null)
  const transactionsRef = useRef(null)
  const riskRef = useRef(null)

  // Determine what to show based on the analysis type (hops)
  const isInitial = !data && !loading
  const isQuick = data && data.hops === 0
  const isDeep = data && data.hops > 0

  const SearchBar = ({ isHero = false }) => (
    <div className={`w-full ${isHero ? 'max-w-2xl' : 'max-w-4xl mb-8'} bg-card border border-border p-6 rounded-3xl shadow-2xl space-y-6 backdrop-blur-xl mx-auto transition-all duration-500`}>
      <div className="relative group">
        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors">
          <Search size={24} />
        </div>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={loading}
          className="w-full bg-surface border-2 border-border rounded-2xl pl-16 pr-6 py-4 text-xl text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 transition-all disabled:opacity-50"
          placeholder="Enter Wallet Address (0x...)"
          onKeyPress={(e) => e.key === 'Enter' && onScan(true)}
        />
      </div>
      <div className="flex gap-4">
        <button
          onClick={() => onScan(true)}
          disabled={loading}
          className="flex-1 bg-primary/10 border border-primary/30 text-primary py-4 rounded-xl font-bold text-lg hover:bg-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Activity size={20} />
          Quick Analysis
        </button>
        <button
          onClick={() => onScan(false)}
          disabled={loading}
          className="flex-1 bg-primary text-background py-5 rounded-xl font-bold text-lg shadow-glow hover:opacity-90 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <ShieldCheck size={20} />
          Deep Dive
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-[80vh] flex flex-col" data-testid="dashboard-container">
      
      {/* 1. Header Section */}
      <div className={`flex flex-col transition-all duration-700 ${isInitial ? 'flex-1 justify-center' : 'pt-4'}`}>
        {isInitial && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-4 mb-12"
          >
            <h1 className="text-6xl font-mono font-bold text-textPrimary tracking-tight">
              CHAKRA <span className="text-primary shadow-glow-text">AI</span>
            </h1>
            <p className="text-textSecondary text-xl max-w-2xl mx-auto leading-relaxed">
              Precision blockchain forensics. Scan any Ethereum wallet to instantly identify risks.
            </p>
          </motion.div>
        )}
        <SearchBar isHero={isInitial} />
      </div>

      {/* 2. Loading State */}
      {loading && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center space-y-8 py-20"
        >
          <div className="relative">
            <div className="w-20 h-20 border-4 border-primary/20 rounded-full"></div>
            <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-mono font-bold text-textPrimary animate-pulse uppercase tracking-widest">
              Scanning Ethereum...
            </h3>
            <p className="text-textSecondary font-mono italic text-sm">
              Analyzing blockchain nodes & calculating risk...
            </p>
          </div>
        </motion.div>
      )}

      {/* 3. Results Section */}
      {(isQuick || isDeep) && !loading && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-10 mt-4"
        >
          {/* Results Status Header with Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card/50 p-6 border border-border rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-4">
               <div className={`w-3 h-3 rounded-full ${isQuick ? 'bg-warning shadow-[0_0_15px_rgba(255,171,0,0.5)]' : 'bg-success shadow-[0_0_15px_rgba(0,240,255,0.5)]'}`}></div>
               <div>
                  <h2 className="text-lg font-mono font-bold text-textPrimary leading-none uppercase">
                    {isQuick ? 'Quick Snapshot' : 'Forensic Intelligence Dossier'}
                  </h2>
                  <p className="text-[10px] text-muted mt-2 font-mono uppercase tracking-widest opacity-60">
                    Target: {address}
                  </p>
               </div>
            </div>
            
            {/* Contextual Controls */}
            <div className="flex items-center gap-4">
              {isDeep && (
                <div className="flex items-center gap-4 border-l border-border pl-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted uppercase">Hops:</span>
                    <select
                      value={hops}
                      onChange={(e) => setHops(Number(e.target.value))}
                      className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-textPrimary focus:outline-none"
                    >
                      <option value={1}>1 Hop</option>
                      <option value={2}>2 Hops</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted uppercase">Size:</span>
                    <select
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-textPrimary focus:outline-none"
                    >
                      <option value={10}>10 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>
                </div>
              )}
              <button
                onClick={() => onScan(isQuick)}
                className="bg-primary/10 text-primary p-2 rounded-lg hover:bg-primary/20 transition-all"
                title="Refresh current view"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* Cards Section */}
          <div ref={overviewRef}>
            <SummaryCards data={data} loading={loading} error={error} />
          </div>

          {/* Forensic Sections (Only for Deep Dive) */}
          {isDeep && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-10"
            >
              <div ref={transactionsRef} className="bg-card backdrop-blur-xl border border-border rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-border flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Layers className="text-primary" size={24} />
                    <h2 className="text-2xl font-mono font-bold text-textPrimary uppercase tracking-tighter">Transaction Explorer</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-surface px-4 py-2 rounded-xl border border-border text-xs font-mono text-textSecondary">
                      Showing <span className="text-primary font-bold">{data?.transactions?.length || 0}</span> of <span className="text-textPrimary font-bold">{data?.transaction_count?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                </div>
                <TransactionsTable
                  transactions={data?.transactions || []}
                  currency={data?.currency || 'ETH'}
                  loading={loading}
                  totalCount={data?.transaction_count || 0}
                  onPageChange={onPageChange}
                  currentPage={data?.page || 1}
                  pageSize={limit}
                />
              </div>

              <div ref={riskRef}>
                <RiskAnalyticsPanel data={data} loading={loading} />
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  )
}
