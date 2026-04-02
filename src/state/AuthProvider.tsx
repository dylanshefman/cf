import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { requestJson } from '../utils/api'

const AUTH_STORAGE_KEY = 'app_authed'
const AUTH_TIMESTAMP_KEY = 'app_authed_at'
const AUTH_MAX_AGE_MS = 10 * 60 * 1000

type AuthContextType = {
  authenticated: boolean
  loggingIn: boolean
  login: (clientId: string, keyId: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  useEffect(() => {
    try {
      const authed = localStorage.getItem(AUTH_STORAGE_KEY)
      const lastLoginAt = Number(localStorage.getItem(AUTH_TIMESTAMP_KEY))
      const hasValidTimestamp = Number.isFinite(lastLoginAt) && lastLoginAt > 0
      const loginIsFresh = hasValidTimestamp && Date.now() - lastLoginAt < AUTH_MAX_AGE_MS

      if (authed === '1' && loginIsFresh) {
        setAuthenticated(true)
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        localStorage.removeItem(AUTH_TIMESTAMP_KEY)
      }
    } catch (e) {
      // ignore
    }
  }, [])

  async function login(clientId: string, keyId: string) {
    setLoggingIn(true)
    try {
      const data = await requestJson<{ ok: boolean }>('/api/auth', {
        method: 'POST',
        body: { clientId, keyId },
      })

      if (data && data.ok) {
        setAuthenticated(true)
        try {
          localStorage.setItem(AUTH_STORAGE_KEY, '1')
          localStorage.setItem(AUTH_TIMESTAMP_KEY, String(Date.now()))
        } catch (e) {
          // ignore
        }
        return true
      }
    } catch (e) {
      // requestJson will throw on non-2xx
    } finally {
      setLoggingIn(false)
    }
    setAuthenticated(false)
    return false
  }

  function logout() {
    setAuthenticated(false)
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      localStorage.removeItem(AUTH_TIMESTAMP_KEY)
    } catch (e) {
      // ignore
    }
  }

  return (
    <AuthContext.Provider value={{ authenticated, loggingIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
