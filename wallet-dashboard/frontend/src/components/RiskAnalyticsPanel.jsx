import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { AlertTriangle, Users, Shield } from 'lucide-react'
import { useMemo } from 'react'
import { Skeleton } from './ui/Skeleton'
import { formatAddress, formatHash } from '../utils/format'
import CopyButton from './ui/CopyButton'

export default function RiskAnalyticsPanel({ data, loading }) {
  // Calculate all analytics from real transaction data
  const analytics = useMemo(() => {
    if (!data || !data.transactions || data.transactions.length === 0) {
      return null
    }

    const txs = data.transactions

    // Calculate risk score based on transaction patterns
    const calculateRiskScore = () => {
      const values = txs.map((tx) => parseFloat(tx.value || 0))
      const avgValue = values.reduce((a, b) => a + b, 0) / values.length
      const maxValue = Math.max(...values)

      // Heuristics:
      // - High average value increases risk
      // - Single very large transaction increases risk
      // - Many small transactions is lower risk

      let score = 0

      if (avgValue > 10) score += 40
      else if (avgValue > 5) score += 25
      else if (avgValue > 1) score += 15
      else score += 5

      if (maxValue > 100) score += 30
      else if (maxValue > 50) score += 20
      else if (maxValue > 10) score += 10

      if (txs.length < 5) score += 20
      else if (txs.length < 10) score += 10

      return Math.min(100, score)
    }

    const riskScore = calculateRiskScore()

    // Calculate exposure breakdown from transaction risk levels
    const riskCounts = { low: 0, medium: 0, high: 0 }
    txs.forEach((tx) => {
      const value = parseFloat(tx.value || 0)
      if (value > 10) riskCounts.high++
      else if (value > 1) riskCounts.medium++
      else riskCounts.low++
    })

    const total = riskCounts.low + riskCounts.medium + riskCounts.high
    const exposureData = [
      {
        name: 'Low Risk',
        value: Math.round((riskCounts.low / total) * 100),
        color: '#22C55E',
      },
      {
        name: 'Medium Risk',
        value: Math.round((riskCounts.medium / total) * 100),
        color: '#F59E0B',
      },
      {
        name: 'High Risk',
        value: Math.round((riskCounts.high / total) * 100),
        color: '#EF4444',
      },
    ].filter((item) => item.value > 0)

    // Extract high-risk counterparties (addresses with multiple high-value transactions)
    const counterpartyMap = new Map()
    txs.forEach((tx) => {
      const addresses = [tx.from, tx.to].filter(Boolean)
      addresses.forEach((addr) => {
        if (!counterpartyMap.has(addr)) {
          counterpartyMap.set(addr, { count: 0, totalValue: 0 })
        }
        const info = counterpartyMap.get(addr)
        info.count++
        info.totalValue += parseFloat(tx.value || 0)
      })
    })

    const highRiskCounterparties = Array.from(counterpartyMap.entries())
      .filter(([addr, info]) => info.totalValue > 5 || info.count > 5)
      .sort((a, b) => b[1].totalValue - a[1].totalValue)
      .slice(0, 3)
      .map(([address, info]) => ({
        address: formatAddress(address),
        fullAddress: address,
        risk: info.totalValue > 20 ? 'HIGH' : 'MEDIUM',
        transactions: info.count,
      }))

    // Identify suspicious transactions (anomalies)
    const avgValue = txs.reduce((sum, tx) => sum + parseFloat(tx.value || 0), 0) / txs.length
    const stdDev = Math.sqrt(
      txs.reduce((sum, tx) => sum + Math.pow(parseFloat(tx.value || 0) - avgValue, 2), 0) /
        txs.length
    )

    const suspiciousTransactions = txs
      .filter((tx) => {
        const value = parseFloat(tx.value || 0)
        // Flag transactions that are > 2 standard deviations from mean
        return value > avgValue + 2 * stdDev || value > 50
      })
      .slice(0, 2)
      .map((tx) => ({
        hash: formatHash(tx.hash),
        fullHash: tx.hash,
        reason:
          parseFloat(tx.value || 0) > 50
            ? 'Extremely large transfer'
            : 'Unusual transaction amount',
      }))

    return {
      riskScore,
      exposureData,
      highRiskCounterparties,
      suspiciousTransactions,
    }
  }, [data])

  if (loading) {
    return (
      <div className="bg-card backdrop-blur-xl border border-border rounded-lg p-6" data-testid="risk-analytics-loading">
        <Skeleton height="h-6" width="w-48" className="mb-6" />
        <div className="space-y-6">
          <Skeleton height="h-32" width="w-full" />
          <Skeleton height="h-48" width="w-full" />
          <Skeleton height="h-32" width="w-full" />
        </div>
      </div>
    )
  }

  if (!analytics) {
    return null
  }

  const { riskScore, exposureData, highRiskCounterparties, suspiciousTransactions } = analytics

  const getRiskLabel = (score) => {
    if (score > 70) return { label: 'High Risk', color: 'text-danger' }
    if (score > 40) return { label: 'Medium Risk', color: 'text-warning' }
    return { label: 'Low Risk', color: 'text-success' }
  }

  const riskInfo = getRiskLabel(riskScore)

  return (
    <motion.div
      className="bg-card backdrop-blur-xl border border-border rounded-lg p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      data-testid="risk-analytics-panel"
    >
      <div className="border-t-2 border-primary mb-6"></div>
      <h3 className="text-lg font-semibold text-textPrimary mb-6">Risk & Analytics</h3>

      <div className="space-y-6">
        {/* Risk Score Progress Bar */}
        <div data-testid="risk-score-section">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-textSecondary">Risk Score</span>
            <span className="text-sm font-medium text-textPrimary">{riskScore}/100</span>
          </div>
          <div className="w-full bg-hover rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                riskScore > 70 ? 'bg-danger' : riskScore > 40 ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${riskScore}%` }}
            ></div>
          </div>
          <div className={`text-xs ${riskInfo.color} mt-1 font-medium`}>{riskInfo.label}</div>
        </div>

        {/* Exposure Breakdown Pie Chart */}
        {exposureData.length > 0 && (
          <div data-testid="exposure-breakdown-section">
            <h4 className="text-sm font-medium text-textPrimary mb-4">Exposure Breakdown</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={exposureData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {exposureData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center space-x-4 mt-2">
              {exposureData.map((item, index) => (
                <div key={index} className="flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-xs text-textSecondary">
                    {item.name} ({item.value}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* High-Risk Counterparties List */}
        {highRiskCounterparties.length > 0 && (
          <div data-testid="high-risk-counterparties-section">
            <h4 className="text-sm font-medium text-textPrimary mb-4 flex items-center">
              <Users size={16} className="mr-2" />
              High-Risk Counterparties
            </h4>
            <div className="space-y-2">
              {highRiskCounterparties.map((party, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-hover rounded-lg border border-border hover:border-primary/30 transition-colors"
                  data-testid={`counterparty-${index}`}
                >
                  <div className="flex items-center group">
                    <div>
                      <div className="font-mono text-sm text-textPrimary" title={party.fullAddress}>{party.address}</div>
                      <div className="text-xs text-textSecondary">{party.transactions} transactions</div>
                    </div>
                    {party.fullAddress && (
                      <CopyButton value={party.fullAddress} className="ml-2 group-hover:opacity-100 opacity-0 focus:opacity-100" />
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      party.risk === 'HIGH'
                        ? 'bg-danger/20 text-danger border border-danger/30'
                        : 'bg-warning/20 text-warning border border-warning/30'
                    }`}
                  >
                    {party.risk}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suspicious Transaction Badges */}
        {suspiciousTransactions.length > 0 && (
          <div data-testid="suspicious-transactions-section">
            <h4 className="text-sm font-medium text-textPrimary mb-4 flex items-center">
              <Shield size={16} className="mr-2" />
              Suspicious Transactions
            </h4>
            <div className="space-y-2">
              {suspiciousTransactions.map((tx, index) => (
                <div
                  key={index}
                  className="flex items-center p-3 bg-hover rounded-lg border border-warning/20"
                  data-testid={`suspicious-tx-${index}`}
                >
                  <AlertTriangle size={16} className="text-warning mr-3" />
                  <div className="flex items-center group flex-1">
                    <div className="flex-1">
                      <div className="font-mono text-sm text-textPrimary" title={tx.fullHash}>{tx.hash}</div>
                      <div className="text-xs text-textSecondary">{tx.reason}</div>
                    </div>
                    {tx.fullHash && (
                      <CopyButton value={tx.fullHash} className="ml-2 group-hover:opacity-100 opacity-0 focus:opacity-100" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No risk indicators */}
        {highRiskCounterparties.length === 0 && suspiciousTransactions.length === 0 && (
          <div className="text-center py-4 text-textSecondary text-sm" data-testid="no-risk-indicators">
            No significant risk indicators detected
          </div>
        )}
      </div>
    </motion.div>
  )
}
