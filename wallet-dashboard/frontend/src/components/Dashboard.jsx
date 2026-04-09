import { motion } from 'framer-motion'
import { ArrowRightLeft, Download, Activity } from 'lucide-react'
import SummaryCards from './SummaryCards'
import TransactionsTable from './TransactionsTable'
import RiskAnalyticsPanel from './RiskAnalyticsPanel'
import ErrorBanner from './ui/ErrorBanner'
import EmptyState from './ui/EmptyState'

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
  onGraph,
  onClearError,
}) {
  return (
    <motion.div
      className="max-w-7xl mx-auto space-y-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      data-testid="dashboard-container"
    >
      {/* Error Banner */}
      {error && (
        <ErrorBanner
          message={error}
          onRetry={onScan}
          onDismiss={onClearError}
        />
      )}

      {/* Header */}
      <div className="bg-card backdrop-blur-xl border border-border rounded-lg p-6">
        <div className="border-b border-border pb-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-success rounded-full animate-pulse" data-testid="status-indicator"></div>
              <h1 className="text-2xl font-mono font-bold text-textPrimary">
                Real-time blockchain intelligence overview
              </h1>
            </div>
            <button
              className="bg-primary/10 border border-primary/20 text-primary px-4 py-2 rounded-lg flex items-center gap-2 hover:shadow-glow transition-all duration-300"
              data-testid="export-button"
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <SummaryCards data={data} loading={loading} error={error} />
      </div>

      {/* Transactions Table */}
      <motion.div
        className="bg-card backdrop-blur-xl border border-border rounded-lg overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <div className="p-6 border-b border-border">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-mono font-bold text-textPrimary">
              Transaction Explorer
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-textSecondary">Hop Count:</span>
                <select
                  value={hops}
                  onChange={(e) => setHops(Number(e.target.value))}
                  className="bg-surface border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-[0_0_0_1px_#00F0FF] caret-primary transition-all"
                  data-testid="hop-count-select"
                  title="Number of BFS hops to trace from the seed wallet"
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? '0 (balance only)' : n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-textSecondary">Tx Limit:</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="bg-surface border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-[0_0_0_1px_#00F0FF] caret-primary transition-all"
                  data-testid="limit-select"
                  title="Max transactions returned per BFS node"
                >
                  {[5, 10, 15, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              {/* Re-scan with current settings */}
              <button
                onClick={onScan}
                disabled={loading}
                className="bg-primary text-background font-semibold px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-glow"
                data-testid="rescan-button"
                title="Apply hops/limit and re-scan"
              >
                <Activity size={15} />
                {loading ? 'Scanning…' : 'Re-scan'}
              </button>
              <button
                onClick={onGraph}
                disabled={!data || loading}
                className="bg-primary/10 border border-primary/20 text-primary px-6 py-2 rounded-lg flex items-center gap-2 hover:shadow-glow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="view-graph-button"
              >
                View Graph <ArrowRightLeft size={16} />
              </button>
            </div>
            <p className="text-xs text-muted mt-2">
              Change hops or limit then click <span className="text-primary font-semibold">Re-scan</span> to apply.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center" data-testid="loading-state">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-textSecondary text-lg">Loading transaction data...</p>
          </div>
        ) : data && data.transactions && data.transactions.length > 0 ? (
          <TransactionsTable
            transactions={data.transactions}
            currency={data.currency || 'ETH'}
            loading={loading}
          />
        ) : (
          <EmptyState
            icon={Activity}
            title="No Transaction Data"
            description="No transactions found for this wallet. Please scan a different wallet or adjust your search parameters."
            action={{
              label: 'Scan Wallet',
              onClick: onScan,
            }}
          />
        )}
      </motion.div>

      {/* Risk & Analytics Panel */}
      {data && data.transactions && data.transactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <RiskAnalyticsPanel data={data} loading={loading} />
        </motion.div>
      )}
    </motion.div>
  )
}
