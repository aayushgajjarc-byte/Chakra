import { useState } from 'react'
import { api, ApiError } from '../services/api'

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!username || !password) {
      setError('Please enter username and password.')
      return
    }

    setLoading(true)
    try {
      const token = await api.login(username, password)
      if (onLoginSuccess) {
        onLoginSuccess(token)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-glow p-8 space-y-6">
        <div className="space-y-4 text-center">
          <img src="/chakra-logo.png" alt="CHAKRA" className="h-12 w-auto object-contain mx-auto" />
          <h1 className="text-2xl font-mono font-bold text-textPrimary">Sign in to Dashboard</h1>
          <p className="text-sm text-textSecondary">
            Demo access only. Use your provided credentials.
          </p>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/40 text-danger text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-[0_0_0_1px_#00F0FF] caret-primary transition-all"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-textSecondary mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textPrimary placeholder-muted focus:outline-none focus:border-primary focus:ring-0 focus:shadow-[0_0_0_1px_#00F0FF] caret-primary transition-all"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary/10 border border-primary/20 text-primary font-semibold px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

