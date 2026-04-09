import { motion } from 'framer-motion'
import { Wallet, Activity, Users, AlertTriangle } from 'lucide-react'
import { CardSkeleton } from './ui/Skeleton'

export default function SummaryCards({ data, loading, error }) {
  // Calculate unique connected wallets from transactions
  const connectedWallets = data
    ? new Set(data.transactions.flatMap((tx) => [tx.from, tx.to].filter(Boolean))).size
    : null

  // Calculate simple risk score based on transaction patterns
  const calculateRiskScore = () => {
    if (!data || !data.transactions || data.transactions.length === 0) return null

    const txs = data.transactions
    const avgValue = txs.reduce((sum, tx) => sum + parseFloat(tx.value || 0), 0) / txs.length
    
    // Simple heuristic: high average value = higher risk
    if (avgValue > 10) return 'MEDIUM'
    if (avgValue > 1) return 'LOW'
    return 'LOW'
  }

  const cards = [
    {
      title: 'Total Balance',
      value: data ? `${parseFloat(data.balance || 0).toFixed(4)} ${data.currency || 'ETH'}` : null,
      icon: Wallet,
      color: 'text-success',
      testId: 'total-balance-card',
    },
    {
      title: 'Total Transactions',
      value: data ? data.transaction_count : null,
      icon: Activity,
      color: 'text-primary',
      testId: 'total-transactions-card',
    },
    {
      title: 'Connected Wallets',
      value: connectedWallets,
      icon: Users,
      color: 'text-warning',
      testId: 'connected-wallets-card',
    },
    {
      title: 'Risk Score',
      value: calculateRiskScore(),
      icon: AlertTriangle,
      color: 'text-success',
      testId: 'risk-score-card',
    },
  ]

  if (loading) {
    return (
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
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
        {cards.map((_, index) => (
          <motion.div
            key={index}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <CardSkeleton />
          </motion.div>
        ))}
      </motion.div>
    )
  }

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
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
      {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <motion.div
            key={index}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            whileHover={{ y: -3, boxShadow: '0 0 30px rgba(0, 240, 255, 0.15)' }}
            className="bg-card backdrop-blur-xl border border-border rounded-lg p-8 shadow-glow hover:shadow-glow-hover transition-all duration-300"
            data-testid={card.testId}
          >
            <div className="border-t-2 border-primary mb-6"></div>
            <div className="flex items-center justify-between mb-6">
              <Icon size={28} className={card.color} />
            </div>
            <div className="text-4xl font-mono font-bold text-textPrimary mb-2">
              {card.value !== null ? card.value : '—'}
            </div>
            <div className="text-sm text-textSecondary uppercase tracking-widest">
              {card.title}
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
