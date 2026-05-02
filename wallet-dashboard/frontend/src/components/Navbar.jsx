import { Search, ChevronDown, Moon, Sun, User } from 'lucide-react'

export default function Navbar({ address, setAddress, network, setNetwork, onSearch, onLogout, theme, onToggleTheme }) {
  const networks = ['Ethereum', 'Bitcoin', 'Polygon']

  return (
    <div
      className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-40 backdrop-blur-xl"
      data-testid="navbar"
    >
      <img src="/chakra-logo.png" alt="CHAKRA" className="h-8 w-auto object-contain mr-4 flex-shrink-0" />
      {/* Empty center space */}
      <div className="flex-1" />

      {/* Network Selector & Actions */}
      <div className="flex items-center space-x-4">
        <div className="relative">
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="bg-surface border border-border rounded-lg px-4 py-2 pr-10 text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-[0_0_0_1px_#00F0FF] caret-primary appearance-none transition-all"
            data-testid="network-selector"
          >
            {networks.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted pointer-events-none"
          />
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg hover:bg-border transition-colors"
          data-testid="dark-mode-toggle"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun size={20} className="text-textSecondary" />
          ) : (
            <Moon size={20} className="text-textSecondary" />
          )}
        </button>

        {/* Profile / Logout */}
        <div className="flex items-center gap-2">
          <button
            className="p-2 rounded-lg hover:bg-border transition-colors"
            data-testid="profile-button"
          >
            <User size={20} className="text-textSecondary" />
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-textSecondary hover:bg-border transition-colors"
              data-testid="logout-button"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
