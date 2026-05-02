import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'
import GraphVisualization from './components/GraphVisualization'
import LandingPage from './components/LandingPage'
import { api, ApiError } from './services/api'

function App() {
  const [activeView, setActiveView] = useState('landing')
  const [dashboardSection, setDashboardSection] = useState('dashboard')
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem('chakra-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    return 'dark'
  })
  const [path, setPath] = useState(window.location.pathname || '/')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [address, setAddress] = useState('')
  const [network, setNetwork] = useState('Ethereum')
  const [hops, setHops] = useState(1)
  const [limit, setLimit] = useState(10)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const navigate = (nextPath) => {
    if (nextPath === path) return
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }

  useEffect(() => {
    const handlePopstate = () => {
      setPath(window.location.pathname || '/')
    }
    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [])

  useEffect(() => {
    if (path === '/dashboard') {
      setActiveView('dashboard')
    } else if (path === '/graph') {
      setActiveView('graph')
    } else {
      setActiveView('landing')
    }
  }, [path])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('chakra-theme', theme)
  }, [theme])

  const fetchWallet = async (isQuick = false, page = 1) => {
    if (!address || !address.trim()) {
      setError('Please enter a valid wallet address')
      return
    }

    setLoading(true)
    setError(null)
    const effectiveHops = isQuick ? 0 : hops

    try {
      const result = await api.fetchWalletDashboard(address.trim(), effectiveHops, limit, page)
      // Debug: inspect full API payload including graph.nodes / graph.edges
      // to verify the backend is returning the expected structure.
      console.log('[App] API RESPONSE:', result)
      setData(result)
    } catch (e) {
      console.error('Fetch error:', e)
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError('Failed to fetch wallet data. Please try again.')
      }
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  // NOTE: hops and limit changes are applied on the next manual Scan click.
  // Removed the auto-refetch useEffect to avoid surprise API calls.

  const renderContent = () => {
    // PUBLIC ROUTES
    if (path === '/dashboard') {
      return (
        <Dashboard
          activeSection={dashboardSection}
          address={address}
          setAddress={setAddress}
          hops={hops}
          setHops={setHops}
          limit={limit}
          setLimit={setLimit}
          data={data}
          loading={loading}
          error={error}
          onScan={(isQuick) => fetchWallet(isQuick, 1)}
          onPageChange={(page) => fetchWallet(false, page)}
          onGraph={() => navigate('/graph')}
          onClearError={() => setError(null)}
        />
      )
    }

    if (path === '/graph') {
      return (
        <GraphVisualization
          data={data}
          onBack={() => navigate('/dashboard')}
        />
      )
    }

    // Default: Landing page at "/"
    return (
      <LandingPage
        onEnterDashboard={() => {
          navigate('/dashboard')
        }}
      />
    )
  }

  const showShell = path === '/dashboard' || path === '/graph'

  return (
    <div className="min-h-screen bg-background flex" data-testid="app-container">
      {showShell && (
        <Sidebar
          activeView={dashboardSection}
          setActiveView={(id) => {
            setDashboardSection(id)
            if (id === 'dashboard' || id === 'wallet-analysis' || id === 'transaction-explorer' || id === 'risk-monitor' || id === 'settings') {
              navigate('/dashboard')
            } else {
              navigate('/dashboard')
            }
          }}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />
      )}
      <div
        className={`flex-1 transition-all duration-300 ${showShell && (sidebarCollapsed ? 'ml-20' : 'ml-60')
          }`}
      >
        {showShell && (
          <Navbar
            address={address}
            setAddress={setAddress}
            network={network}
            setNetwork={setNetwork}
            onSearch={(isQuick) => fetchWallet(isQuick)}
            theme={theme}
            onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            onLogout={() => {
              setData(null)
              setError(null)
              navigate('/')
            }}
          />
        )}
        <main className={path === '/graph' ? 'p-0 overflow-hidden' : 'p-6'}>
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

export default App
