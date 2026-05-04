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
  const [analysisMode, setAnalysisMode] = useState(null) // 'quick' | 'deep' | null
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
    
    const handleSearch = (event) => {
      const { address } = event.detail
      if (address) {
        setAddress(address)
        // We use setTimeout to ensure setAddress has updated before calling fetchWallet
        // or we can pass address directly to fetchWallet
      }
    }

    window.addEventListener('popstate', handlePopstate)
    window.addEventListener('chakra-search', handleSearch)
    
    return () => {
      window.removeEventListener('popstate', handlePopstate)
      window.removeEventListener('chakra-search', handleSearch)
    }
  }, [])

  // Auto-search when address is updated from a history click
  useEffect(() => {
    if (address && activeView === 'dashboard') {
      // Check if this was a history click by verifying if the address is not already analyzed
      if (data?.wallet !== address.toLowerCase()) {
        fetchWallet(true, 1)
      }
    }
  }, [address])

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

  const fetchWallet = async (isQuick = false, page = 1, refresh = false, overrides = {}) => {
    if (!address || !address.trim()) {
      setError('Please enter a valid wallet address')
      return
    }

    setLoading(true)
    setError(null)
    const effectiveHops = isQuick ? 0 : (overrides.hops ?? hops)
    const effectiveLimit = overrides.limit ?? limit

    try {
      const result = await api.fetchWalletDashboard(
        address.trim(),
        effectiveHops,
        effectiveLimit,
        page,
        refresh
      )
      // Debug: inspect full API payload including graph.nodes / graph.edges
      // to verify the backend is returning the expected structure.
      console.log('[App] API RESPONSE:', result)
      setData(result)
      setAnalysisMode(isQuick ? 'quick' : 'deep')
    } catch (e) {
      console.error('Fetch error:', e)
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError('Failed to fetch wallet data. Please try again.')
      }
      setData(null)
      setAnalysisMode(null)
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
          limit={limit}
          data={data}
          analysisMode={analysisMode}
          loading={loading}
          error={error}
          onScan={(isQuick) => fetchWallet(isQuick, 1)}
          onRefresh={() => fetchWallet(analysisMode !== 'deep', 1, true)}
          onPageChange={(page) => fetchWallet(false, page)}
          onHopsChange={(nextHops) => {
            setHops(nextHops)
            if (analysisMode === 'deep') fetchWallet(false, 1, false, { hops: nextHops })
          }}
          onLimitChange={(nextLimit) => {
            setLimit(nextLimit)
            if (analysisMode === 'deep') fetchWallet(false, 1, false, { limit: nextLimit })
          }}
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
            navigate('/dashboard')
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
