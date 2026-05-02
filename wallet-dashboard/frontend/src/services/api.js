/**
 * api.js — Centralized API client with automatic auth header injection
 * and global 401 handling (redirect to login + clear stale token).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

if (!API_BASE_URL) {
  console.warn(
    '[api] VITE_API_BASE_URL is not set. Falling back to http://localhost:8000. ' +
    'Set VITE_API_BASE_URL in frontend/.env to override.'
  )
}

// ---------------------------------------------------------------------------
// Token helpers (localStorage-backed, in-memory cached)
// ---------------------------------------------------------------------------

let _cachedToken = null

export const getAuthToken = () => {
  if (_cachedToken) return _cachedToken
  if (typeof window !== 'undefined') {
    _cachedToken = window.localStorage.getItem('authToken') || null
  }
  return _cachedToken
}

export const setAuthToken = (token) => {
  _cachedToken = token
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('authToken', token)
  }
}

export const clearAuthToken = () => {
  _cachedToken = null
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('authToken')
  }
}

// ---------------------------------------------------------------------------
// 401 handler removed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Core request helper — injects Authorization header, handles 401 globally
// ---------------------------------------------------------------------------

const _request = async (url, options = {}) => {
  const token = getAuthToken()

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`

  let response
  try {
    response = await fetch(fullUrl, { ...options, headers })
  } catch (networkErr) {
    throw new ApiError(
      `Network error — is the backend running at ${API_BASE_URL}? (${networkErr.message})`,
      0
    )
  }

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errText = await response.text()
      if (errText) {
        const errBody = JSON.parse(errText)
        detail = errBody.detail || errBody.message || detail
      }
    } catch (_) { /* ignore parse error */ }
    throw new ApiError(`Request failed (${response.status}): ${detail}`, response.status)
  }

  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch (parseErr) {
    console.error('[api] Failed to parse JSON response:', text)
    throw new ApiError(`Invalid response format: ${parseErr.message}`, response.status)
  }
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export const api = {

  /**
   * Login — does NOT use _request (no auth needed, no 401 interception).
   */
  async login(username, password) {
    const fullUrl = `${API_BASE_URL}/api/auth/login`

    let response
    try {
      response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
    } catch (networkErr) {
      throw new ApiError(
        `Cannot reach backend at ${API_BASE_URL}. Is it running?`,
        0
      )
    }

    if (response.status === 401 || !response.ok) {
      throw new ApiError('Invalid username or password.', response.status)
    }

    const text = await response.text()
    let data;
    try {
      data = text ? JSON.parse(text) : {}
    } catch (parseErr) {
      console.error('[api] Login response is not valid JSON:', text)
      throw new ApiError('Invalid response from server.', 500)
    }
    
    if (!data?.access_token) {
      throw new ApiError('No token returned by server.', 500)
    }

    setAuthToken(data.access_token)
    return data.access_token
  },

  /**
   * POST /api/wallet/analyze — primary dashboard endpoint.
   * Token is automatically injected. 401 → redirect to login.
   */
  async fetchWalletDashboard(address, hops = 1, limit = 10, page = 1) {
    return _request('/api/wallet/analyze', {
      method: 'POST',
      body: JSON.stringify({ address, hops, limit, page }),
    })
  },

  /**
   * GET /analyze/:address — backwards-compatible endpoint.
   */
  async analyzeWallet(inputValue, hops = 1) {
    return _request(
      `/analyze/${encodeURIComponent(inputValue)}?hops=${hops}`
    )
  },

  /**
   * Expand connections for graph — reuses wallet analyze.
   */
  async expandConnections(address, hops = 1, limit = 10) {
    return _request('/api/wallet/analyze', {
      method: 'POST',
      body: JSON.stringify({ address, hops, limit }),
    })
  },
}
