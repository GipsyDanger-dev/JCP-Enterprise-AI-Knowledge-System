import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  login as apiLogin,
  loginWithGoogle as apiGoogleLogin,
  requestPasswordReset as apiRequestPasswordReset,
  logout as apiLogout,
  me as apiMe,
  registerPersonal as apiRegisterPersonal,
  resetPassword as apiResetPassword,
  verifyPasswordResetCode as apiVerifyPasswordResetCode,
  verifyPersonalRegistration as apiVerifyPersonalRegistration,
  registerCompany as apiRegisterCompany,
  verifyCompanyRegistration as apiVerifyCompanyRegistration,
  updateOwnProfile as apiUpdateOwnProfile,
  requestOwnEmailRegistration as apiRequestOwnEmailRegistration,
  verifyOwnEmailRegistration as apiVerifyOwnEmailRegistration,
} from '@/api/auth'
import type { ApiUser, OwnProfileResponse } from '@/api/types'
import { markTutorialPending } from '@/utils/tutorial'
import { AuthContext, LOGOUT_REASON_KEY } from './authContextValue'

/**
 * Catatan keamanan: token disimpan di localStorage untuk demo SPA.
 * Untuk produksi, pertimbangkan httpOnly cookie + refresh token.
 */
const TOKEN_KEY = 'ea.token'

/**
 * Batas diam sebelum sesi diakhiri. Tab yang sudah login melakukan polling tiap
 * 5 detik, dan setiap polling membangunkan database Neon — tab yang ditinggal
 * terbuka semalaman membuatnya menyala semalaman dan menghabiskan kuota compute.
 * Logout otomatis menghentikan polling itu sekaligus menutup sesi di komputer
 * yang ditinggal.
 */
const IDLE_LIMIT_MS = 20 * 60 * 1000
const IDLE_CHECK_INTERVAL_MS = 30 * 1000
// Aktivitas terakhir disimpan di localStorage supaya dibagi antar-tab: tanpa
// ini tab yang diam akan me-logout sesi yang sedang dipakai di tab lain, karena
// semua tab memakai token yang sama.
const LAST_ACTIVITY_KEY = 'ea.lastActivity'
const ACTIVITY_WRITE_THROTTLE_MS = 15 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const

/**
 * Simpan token sesi baru. Jejak aktivitas ikut ditulis ulang: sisa dari sesi
 * sebelumnya — yang diakhiri lewat tombol logout atau karena token
 * kedaluwarsa — akan membuat login berikutnya langsung dianggap diam terlalu
 * lama dan dikeluarkan lagi.
 */
function storeToken(accessToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
  // Setiap login (biasa, Google, atau daftar) lewat sini, jadi cukup satu
  // tempat untuk menjadwalkan tutorial di halaman akun berikutnya.
  markTutorialPending()
}

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
            workspaceId: profile.workspaceId,
            isPlatformOwner: profile.isPlatformOwner,
            displayName: profile.displayName || profile.username,
            username: profile.username,
            email: profile.email ?? null,
            employeeNumber: profile.employeeNumber,
            division: profile.division,
            jobTitle: profile.jobTitle,
            // Wewenang yang menempel pada jabatan ikut dipulihkan; tanpa ini
            // tombol yang bergantung padanya hilang setiap kali halaman dimuat
            // ulang, sampai pengguna login lagi.
            jabatanId: profile.jabatanId ?? null,
            jabatan: profile.jabatan ?? null,
            role: profile.role,
            // Unit kerja ikut dipulihkan: tanpa ini dialog unggah kehilangan
            // unit penggunanya setiap kali halaman dimuat ulang.
            unitKerjaId: profile.unitKerjaId ?? null,
            unitKerja: profile.unitKerja ?? null,
            isAdmin: (profile as any).isAdmin ?? false,
            accountType: profile.accountType ?? 'COMPANY',
            photoUrl: (profile as any).photoUrl,
            workspaceSubscription: profile.workspaceSubscription ?? null,
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
    storeToken(response.accessToken)
    setToken(response.accessToken)
    setUser(response.user)
  }, [])

  const loginWithGoogle = useCallback(async (credential: string) => {
    const response = await apiGoogleLogin({ credential })
    storeToken(response.accessToken)
    setToken(response.accessToken)
    setUser(response.user)
  }, [])

  const registerPersonal = useCallback(async (
    displayName: string,
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => {
    return apiRegisterPersonal({ displayName, username, email, password, confirmPassword })
  }, [])

  const verifyPersonalRegistration = useCallback(async (email: string, code: string) => {
    const response = await apiVerifyPersonalRegistration({ email, code })
    storeToken(response.accessToken)
    setToken(response.accessToken)
    setUser(response.user)
  }, [])

  const requestPasswordReset = useCallback((email: string) => apiRequestPasswordReset(email), [])

  const verifyPasswordResetCode = useCallback(async (email: string, code: string) => {
    const response = await apiVerifyPasswordResetCode({ email, code })
    return response.resetToken
  }, [])

  const resetPassword = useCallback(async (resetToken: string, password: string, confirmPassword: string) => {
    await apiResetPassword({ resetToken, password, confirmPassword })
  }, [])

  const registerCompany = useCallback(async (input: Parameters<typeof apiRegisterCompany>[0]) => {
    return apiRegisterCompany(input)
  }, [])

  const verifyCompanyRegistration = useCallback(async (email: string, code: string) => {
    const response = await apiVerifyCompanyRegistration({ email, code })
    if ('accessToken' in response) {
      storeToken(response.accessToken)
      setToken(response.accessToken)
      setUser(response.user)
    }
    return response
  }, [])

  const updateOwnProfile = useCallback(async (data: Partial<OwnProfileResponse>) => {
    const currentToken = localStorage.getItem(TOKEN_KEY)
    if (!currentToken) throw new Error('Authentication required')
    const updated = await apiUpdateOwnProfile(currentToken, data)
    setUser((current) => current ? { ...current, ...updated } : current)
    return updated
  }, [])

  const requestOwnEmailRegistration = useCallback(async (email: string) => {
    const currentToken = localStorage.getItem(TOKEN_KEY)
    if (!currentToken) throw new Error('Authentication required')
    return apiRequestOwnEmailRegistration(currentToken, email)
  }, [])

  const verifyOwnEmailRegistration = useCallback(async (email: string, code: string) => {
    const currentToken = localStorage.getItem(TOKEN_KEY)
    if (!currentToken) throw new Error('Authentication required')
    const registered = await apiVerifyOwnEmailRegistration(currentToken, { email, code })
    setUser((current) => current ? { ...current, email: registered.email } : current)
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

  useEffect(() => {
    if (!token) return
    let lastWritten = 0

    const markActive = (force = false) => {
      const now = Date.now()
      if (!force && now - lastWritten < ACTIVITY_WRITE_THROTTLE_MS) return
      lastWritten = now
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now))
    }

    const idleTooLong = () => {
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY))
      return Number.isFinite(last) && last > 0 && Date.now() - last >= IDLE_LIMIT_MS
    }

    const endIdleSession = () => {
      sessionStorage.setItem(LOGOUT_REASON_KEY, 'idle')
      localStorage.removeItem(LAST_ACTIVITY_KEY)
      void logout()
    }

    // Sesi yang dipulihkan setelah tab lama ditutup ikut diperiksa: tanpa ini
    // membuka aplikasi keesokan harinya langsung masuk lagi, padahal sesinya
    // sudah diam jauh lebih lama dari batasnya.
    if (idleTooLong()) {
      endIdleSession()
      return
    }
    markActive(true)

    const onActivity = () => markActive()
    const checkIdle = () => { if (idleTooLong()) endIdleSession() }
    // Timer tidak jalan selama laptop tidur; periksa begitu tab terlihat lagi
    // supaya halaman lama tidak sempat dipakai sebelum pemeriksaan berikutnya.
    const onVisible = () => { if (document.visibilityState === 'visible') checkIdle() }

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    const interval = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS)
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(interval)
    }
  }, [token, logout])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, registerPersonal, verifyPersonalRegistration, requestPasswordReset, verifyPasswordResetCode, resetPassword, registerCompany, verifyCompanyRegistration, updateOwnProfile, requestOwnEmailRegistration, verifyOwnEmailRegistration, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
