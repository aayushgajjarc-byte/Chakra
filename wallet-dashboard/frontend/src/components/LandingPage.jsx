import { motion } from 'framer-motion'
import { ArrowRight, Shield, Eye, Zap, TrendingUp, Activity, Users } from 'lucide-react'
import SummaryCards from './SummaryCards'
import TransactionsTable from './TransactionsTable'
import RiskAnalyticsPanel from './RiskAnalyticsPanel'

// ---------------------------------------------------------------------------
// Static mock data — no backend call needed for the landing page preview
// ---------------------------------------------------------------------------
const MOCK_DATA = {
  balance: '4.8271',
  currency: 'ETH',
  transaction_count: 142,
  transactions: [
    {
      hash: '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      from: '0xDemoSender1111111111111111111111111111',
      to: '0xDemoReceiver2222222222222222222222222222',
      value: '2.5',
      timestamp: '2024-03-15T10:23:00Z',
      direction: 'out',
    },
    {
      hash: '0xb2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      from: '0xDemoSender3333333333333333333333333333',
      to: '0xDemoReceiver4444444444444444444444444444',
      value: '0.75',
      timestamp: '2024-03-14T08:10:00Z',
      direction: 'in',
    },
    {
      hash: '0xc3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      from: '0xDemoSender5555555555555555555555555555',
      to: '0xDemoReceiver6666666666666666666666666666',
      value: '12.0',
      timestamp: '2024-03-13T19:45:00Z',
      direction: 'out',
    },
    {
      hash: '0xd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
      from: '0xDemoSender7777777777777777777777777777',
      to: '0xDemoReceiver8888888888888888888888888888',
      value: '0.32',
      timestamp: '2024-03-12T14:05:00Z',
      direction: 'in',
    },
    {
      hash: '0xe5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      from: '0xDemoSender9999999999999999999999999999',
      to: '0xDemoReceiveAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      value: '55.0',
      timestamp: '2024-03-11T07:30:00Z',
      direction: 'out',
    },
    {
      hash: '0xf6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
      from: '0xDemoSenderBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      to: '0xDemoReceiverCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      value: '1.1',
      timestamp: '2024-03-10T22:15:00Z',
      direction: 'in',
    },
  ],
}

export default function LandingPage({ onEnterDashboard }) {
  // Static mock — no loading state, no API calls
  const dashboardData = MOCK_DATA

  const features = [
    {
      icon: Shield,
      title: 'Advanced Risk Analysis',
      description: 'Comprehensive risk scoring and threat detection across blockchain networks.',
    },
    {
      icon: Eye,
      title: 'Real-time Monitoring',
      description: 'Continuous surveillance of wallet activities and transaction patterns.',
    },
    {
      icon: Zap,
      title: 'Instant Insights',
      description: 'Lightning-fast analysis of complex transaction graphs and entity relationships.',
    },
    {
      icon: TrendingUp,
      title: 'Behavioral Analytics',
      description: 'Deep learning-powered insights into wallet behavior and risk patterns.',
    },
    {
      icon: Activity,
      title: 'Transaction Tracing',
      description: 'Multi-hop transaction tracing with visual graph representations.',
    },
    {
      icon: Users,
      title: 'Entity Clustering',
      description: 'Automated identification and clustering of related blockchain entities.',
    },
  ]

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent" />
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#00F0FF_1px,transparent_1px),linear-gradient(to_bottom,#00F0FF_1px,transparent_1px)] bg-[size:50px_50px] animate-pulse" />
          </div>
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <img src="/chakra-logo.png" alt="CHAKRA" className="h-16 lg:h-20 w-auto object-contain mx-auto mb-8" />
            <h1 className="text-5xl lg:text-7xl font-mono font-bold text-textPrimary mb-6 leading-tight">
              Blockchain
              <span className="block text-primary">Intelligence</span>
              Platform
            </h1>
            <p className="text-xl text-textSecondary mb-12 max-w-3xl mx-auto leading-relaxed">
              Advanced wallet analysis and risk assessment for blockchain security professionals.
              Uncover hidden connections, assess threats, and protect your assets with enterprise-grade
              intelligence.
            </p>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)' }}
              whileTap={{ scale: 0.95 }}
              onClick={onEnterDashboard}
              className="bg-primary/10 backdrop-blur-sm border border-primary/20 text-primary font-semibold px-8 py-4 rounded-lg flex items-center gap-3 mx-auto hover:bg-primary/20 transition-all duration-300"
              data-testid="enter-dashboard-button"
            >
              Enter Dashboard
              <ArrowRight size={20} />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-card/50 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-mono font-bold text-textPrimary mb-4">Enterprise Features</h2>
            <p className="text-lg text-textSecondary max-w-2xl mx-auto">
              Comprehensive blockchain intelligence tools designed for security professionals and
              compliance teams.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{
                    scale: 1.02,
                    boxShadow: '0 0 15px rgba(0, 240, 255, 0.1)',
                    borderColor: 'rgba(0, 240, 255, 0.3)',
                  }}
                  className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-8 hover:border-primary/30 transition-all duration-300"
                  data-testid={`feature-card-${index}`}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <Icon size={24} className="text-primary" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-textPrimary mb-3">{feature.title}</h3>
                  <p className="text-textSecondary leading-relaxed">{feature.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-mono font-bold text-textPrimary mb-4">
              Dashboard Preview
            </h2>
            <p className="text-lg text-textSecondary max-w-2xl mx-auto">
              A sample of the real-time blockchain analysis tools available inside the platform.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-8"
          >
            {/* Summary Cards */}
            <div className="mb-8">
              <SummaryCards data={dashboardData} loading={false} />
            </div>

            {/* Transactions Table */}
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-textPrimary mb-6">Recent Transactions</h3>
              <TransactionsTable
                transactions={dashboardData.transactions}
                currency={dashboardData.currency}
                loading={false}
              />
            </div>

            {/* Risk Analytics Panel */}
            <RiskAnalyticsPanel data={dashboardData} loading={false} />
          </motion.div>
        </div>
      </section>
    </div>
  )
}
