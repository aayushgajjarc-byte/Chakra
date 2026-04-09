import { useState } from 'react'
import { Home, Search, BarChart3, Activity, Settings } from 'lucide-react'

export default function Sidebar({ activeView, setActiveView, collapsed, setCollapsed }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'wallet-analysis', label: 'Wallet Analysis', icon: Search },
    { id: 'transaction-explorer', label: 'Transaction Explorer', icon: BarChart3 },
    { id: 'risk-monitor', label: 'Risk Monitor', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

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
        <nav className="flex-1 px-4 py-6">
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
