import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { login as apiLogin, me as apiMe, logout as apiLogout } from '@/api/auth'
import type { ApiUser } from '@/api/types'
import { AuthContext } from './authContextValue'

/**
 * Catatan keamanan: token disimpan di localStorage untuk demo SPA.
 * Untuk produksi, pertimbangkan httpOnly cookie + refresh token.
 */
const TOKEN_KEY = 'ea.token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)))

  // Pulihkan sesi dari token tersimpan
  useEffect(() => {
    if (!token) return
    let cancelled = false
    apiMe(token)
      .then((profile) => {
        if (!cancelled) {
          setUser({
            id: profile.sub,
            displayName: profile.displayName || profile.username,
            username: profile.username,
            employeeNumber: profile.employeeNumber,
            division: profile.division,
            jobTitle: profile.jobTitle,
            role: profile.role,
            // Unit kerja ikut dipulihkan: tanpa ini dialog unggah kehilangan
            // unit penggunanya setiap kali halaman dimuat ulang.
            unitKerjaId: profile.unitKerjaId ?? null,
            unitKerja: profile.unitKerja ?? null,
            isAdmin: (profile as any).isAdmin ?? false,
            photoUrl: (profile as any).photoUrl,
          })
        }
      })
      .catch(() => {
        // Token tidak valid/kedaluwarsa — bersihkan sesi
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [token])

  const login = useCallback(async (username: string, password: string) => {
    const response = await apiLogin({ username, password })
    localStorage.setItem(TOKEN_KEY, response.accessToken)
    setToken(response.accessToken)
    setUser(response.user)
  }, [])

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem(TOKEN_KEY)
    if (currentToken) {
      try {
        await apiLogout(currentToken)
      } catch (error) {
        // Best-effort logout, ignore errors to prevent getting stuck
        console.warn('Failed to logout from server:', error)
      }
    }
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
