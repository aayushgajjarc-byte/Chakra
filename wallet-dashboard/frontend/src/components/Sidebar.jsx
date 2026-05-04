import { Home, Search, BarChart3, Activity, Clock, ExternalLink, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { formatAddress } from '../utils/format'

export default function Sidebar({ activeView, setActiveView, collapsed, setCollapsed }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'wallet-analysis', label: 'Wallet Analysis', icon: Search },
    { id: 'transaction-explorer', label: 'Transaction Explorer', icon: BarChart3 },
    { id: 'risk-monitor', label: 'Risk Monitor', icon: Activity },
  ]

  const [history, setHistory] = useState([])
  const [clearingCache, setClearingCache] = useState(false)

  const loadHistory = async () => {
    try {
      const data = await api.fetchHistory()
      if (data && data.history) {
        setHistory(data.history)
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  useEffect(() => {
    // Load initially
    loadHistory()
    
    // Refresh every minute if not collapsed
    let interval
    if (!collapsed) {
      interval = setInterval(loadHistory, 60000)
    }
    
    return () => clearInterval(interval)
  }, [collapsed])

  const handleClearCache = async () => {
    if (clearingCache) return
    const confirmed = window.confirm('Clear all cached transactions and recent queries from MongoDB?')
    if (!confirmed) return
    setClearingCache(true)
    try {
      await api.clearWalletCache()
      await loadHistory()
    } catch (err) {
      console.error('Failed to clear MongoDB cache:', err)
    } finally {
      setClearingCache(false)
    }
  }

  const handleClearAddressCache = async (addressToClear) => {
    if (clearingCache || !addressToClear) return
    const confirmed = window.confirm(`Clear cached transactions for ${addressToClear}?`)
    if (!confirmed) return
    setClearingCache(true)
    try {
      await api.clearWalletCache(addressToClear)
      await loadHistory()
    } catch (err) {
      console.error('Failed to clear address cache:', err)
    } finally {
      setClearingCache(false)
    }
  }

  return (
    <div className={`fixed left-0 top-0 h-full bg-card border-r border-border transition-all duration-300 ${collapsed ? 'w-20' : 'w-60'} z-50`}>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center justify-center h-16 border-b border-border px-2">
          <img
            src="/chakra-logo.png"
            alt="CHAKRA"
            className={`object-contain ${collapsed ? 'h-8 w-8' : 'h-10 max-w-[180px]'}`}
          />
        </div>

        {/* Menu Items */}
        <nav className="flex-1 px-4 py-6 overflow-y-auto custom-scrollbar">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveView(item.id)}
                    className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-start'} px-3 py-3 rounded-lg transition-colors ${
                      activeView === item.id
                        ? 'bg-primary text-background'
                        : 'text-textSecondary hover:bg-border hover:text-textPrimary'
                    }`}
                  >
                    <Icon size={20} />
                    {!collapsed && <span className="ml-3">{item.label}</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Recent History */}
          {!collapsed && history.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center text-textSecondary px-3 mb-4 uppercase tracking-wider text-xs font-bold">
                <Clock size={14} className="mr-2" />
                <span>Recent Queries</span>
                <button
                  onClick={handleClearCache}
                  disabled={clearingCache}
                  title="Clear cached transactions and queries from MongoDB"
                  className="ml-auto p-1 rounded text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <ul className="space-y-1">
                {history.slice(0, 5).map((query, idx) => (
                  <li key={idx}>
                    <div className="w-full px-3 py-2 rounded-lg text-sm text-textSecondary hover:bg-border hover:text-textPrimary transition-colors group flex items-center justify-between">
                      <button
                        onClick={() => {
                          console.log('Navigate to:', query.address)
                          window.dispatchEvent(new CustomEvent('chakra-search', { detail: { address: query.address } }))
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span title={query.address}>{formatAddress(query.address)}</span>
                      </button>
                      <div className="ml-2 flex items-center gap-1">
                        <button
                          onClick={() => handleClearAddressCache(query.address)}
                          disabled={clearingCache}
                          className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Clear cache for this address"
                        >
                          <Trash2 size={12} />
                        </button>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center px-3 py-2 rounded-lg text-textSecondary hover:bg-border hover:text-textPrimary transition-colors"
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>
      </div>
    </div>
  )
}
