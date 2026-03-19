import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { requestJson } from '../utils/api'

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
      const v = localStorage.getItem('app_authed')
      if (v === '1') setAuthenticated(true)
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
          localStorage.setItem('app_authed', '1')
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
      localStorage.removeItem('app_authed')
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
