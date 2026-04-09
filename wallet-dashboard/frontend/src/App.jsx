import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'
import GraphVisualization from './components/GraphVisualization'
import LandingPage from './components/LandingPage'
import Login from './components/Login'
import { api, ApiError, getAuthToken, clearAuthToken } from './services/api'

function App() {
  const [activeView, setActiveView] = useState('landing')
  const [path, setPath] = useState(window.location.pathname || '/')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [address, setAddress] = useState('')
  const [network, setNetwork] = useState('Ethereum')
  const [hops, setHops] = useState(1)
  const [limit, setLimit] = useState(10)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [token, setToken] = useState(null)

  const navigate = (nextPath) => {
    if (nextPath === path) return
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }

  useEffect(() => {
    const existingToken = getAuthToken()
    if (existingToken) {
      setToken(existingToken)
    }
  }, [])

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

  // Route guard: protect dashboard/graph, redirect login appropriately
  useEffect(() => {
    if (!token && (path === '/dashboard' || path === '/graph')) {
      navigate('/login')
    } else if (token && path === '/login') {
      navigate('/dashboard')
    }
  }, [token, path])

  const fetchWallet = async () => {
    if (!address || !address.trim()) {
      setError('Please enter a valid wallet address')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await api.fetchWalletDashboard(address.trim(), hops, limit)
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
    if (path === '/login') {
      return (
        <Login
          onLoginSuccess={(newToken) => {
            setToken(newToken)
            navigate('/dashboard')
          }}
        />
      )
    }

    if (path === '/dashboard') {
      if (!token) {
        return null
      }
      return (
        <Dashboard
          address={address}
          setAddress={setAddress}
          hops={hops}
          setHops={setHops}
          limit={limit}
          setLimit={setLimit}
          data={data}
          loading={loading}
          error={error}
          onScan={fetchWallet}
          onGraph={() => navigate('/graph')}
          onClearError={() => setError(null)}
        />
      )
    }

    if (path === '/graph') {
      if (!token) {
        return null
      }
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
          if (token) {
            navigate('/dashboard')
          } else {
            navigate('/login')
          }
        }}
      />
    )
  }

  const showShell = token && (path === '/dashboard' || path === '/graph')

  return (
    <div className="min-h-screen bg-background flex" data-testid="app-container">
      {showShell && (
        <Sidebar
          activeView={activeView === 'graph' ? 'dashboard' : activeView}
          setActiveView={(id) => {
            if (!token) return
            if (id === 'dashboard' || id === 'wallet-analysis' || id === 'transaction-explorer' || id === 'risk-monitor') {
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
            onSearch={fetchWallet}
            onLogout={() => {
              clearAuthToken()
              setToken(null)
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
