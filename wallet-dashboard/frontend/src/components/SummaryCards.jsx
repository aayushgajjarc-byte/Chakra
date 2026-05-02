import { motion } from 'framer-motion'
import { Wallet, Activity, Users, AlertTriangle, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { CardSkeleton } from './ui/Skeleton'

export default function SummaryCards({ data, loading, error }) {
  // Determine if we should show the full set or just the quick set
  const isQuick = data && data.hops === 0

  const cards = [
    {
      title: 'Total Balance',
      value: data && data.balance !== undefined ? `${parseFloat(data.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 4 })} ${data.currency || 'ETH'}` : null,
      icon: Wallet,
      color: 'text-success',
      testId: 'total-balance-card',
      showInQuick: true,
    },
    {
      title: 'Total Transactions',
      value: data?.transaction_count ?? data?.transactions?.length ?? 0,
      icon: Activity,
      color: 'text-primary',
      testId: 'total-transactions-card',
      showInQuick: true,
      breakdown: data ? { in: data.incoming_count, out: data.outgoing_count } : null
    },
    {
      title: 'Connected Wallets',
      value: data ? (data.connected_wallets_count ?? 0) : null,
      icon: Users,
      color: 'text-warning',
      testId: 'connected-wallets-card',
      showInQuick: false,
    },
    {
      title: 'Risk Score',
      value: data ? `${data.risk_score || 0}%` : null,
      icon: AlertTriangle,
      color: 'text-danger',
      testId: 'risk-score-card',
      showInQuick: false,
    },
  ]

  // Filter cards based on mode
  const visibleCards = isQuick ? cards.filter(c => c.showInQuick) : cards

  if (loading) {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${isQuick ? '2' : '4'} gap-6 mb-8`}>
        {[1, 2, 3, 4].slice(0, isQuick ? 2 : 4).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <motion.div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${visibleCards.length} gap-6 mb-8`}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
          },
        },
      }}
    >
      {visibleCards.map((card, index) => {
        const Icon = card.icon
        return (
          <motion.div
            key={card.title}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0, 240, 255, 0.1)' }}
            className="bg-card backdrop-blur-xl border border-border rounded-2xl p-8 shadow-xl hover:border-primary/50 transition-all duration-300 relative overflow-hidden group"
            data-testid={card.testId}
          >
            {/* Design Accent */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50`} />
            
            <div className="flex items-center justify-between mb-6">
              <div className={`p-3 rounded-xl bg-surface border border-border group-hover:border-primary/50 transition-colors`}>
                <Icon size={24} className={card.color} />
              </div>
              {card.breakdown && (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <div className="flex items-center text-success bg-success/10 px-2 py-1 rounded-lg">
                    <ArrowDownLeft size={12} className="mr-1" />
                    {card.breakdown.in?.toLocaleString() || 0}
                  </div>
                  <div className="flex items-center text-danger bg-danger/10 px-2 py-1 rounded-lg">
                    <ArrowUpRight size={12} className="mr-1" />
                    {card.breakdown.out?.toLocaleString() || 0}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-3xl font-mono font-bold text-textPrimary tracking-tight">
                {card.value !== null ? (typeof card.value === 'number' ? card.value.toLocaleString() : card.value) : '—'}
              </div>
              <div className="text-sm text-textSecondary uppercase tracking-widest font-medium opacity-70">
                {card.title}
              </div>
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
