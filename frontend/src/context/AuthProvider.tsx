import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { login as apiLogin, me as apiMe } from '@/api/auth'
import { registerUnauthorizedHandler } from '@/api/client'
import type { ApiUser } from '@/api/types'
import { AuthContext } from './authContextValue'

const TOKEN_KEY = 'ea.token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))
  const activeToken = useRef(token)
  activeToken.current = token

  const clearSession = useCallback(() => {
    activeToken.current = null
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setLoading(false)
  }, [])

  useEffect(() => registerUnauthorizedHandler((requestToken) => {
    // Respons terlambat dari token lama tidak boleh mengakhiri sesi yang baru.
    if (requestToken !== activeToken.current) return
    clearSession()
  }), [clearSession])

  // Pulihkan sesi dari token tersimpan
  useEffect(() => {
    if (!token) return
    let cancelled = false
    apiMe(token)
      .then((profile) => {
        if (!cancelled) {
          setUser({
            id: profile.sub,
            displayName: profile.displayName,
            email: profile.email,
            role: profile.role,
          })
        }
      })
      .catch(() => {
        // Token tidak valid/kedaluwarsa — bersihkan sesi
        if (!cancelled) {
          clearSession()
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [clearSession, token])

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin({ email, password })
    activeToken.current = response.accessToken
    localStorage.setItem(TOKEN_KEY, response.accessToken)
    setToken(response.accessToken)
    setUser(response.user)
  }, [])

  const logout = clearSession

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
