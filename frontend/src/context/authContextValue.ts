import { createContext } from 'react'
import type { ApiUser, CompanyCheckoutResponse, LoginResponse, OwnProfileResponse } from '@/api/types'

export interface AuthContextValue {
  user: ApiUser | null
  token: string | null
  /** true saat memulihkan sesi dari token tersimpan */
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  registerPersonal: (displayName: string, username: string, email: string, password: string, confirmPassword: string) => Promise<void>
  registerCompany: (input: {
    organizationName: string
    adminName: string
    adminUsername: string
    adminEmail: string
    password: string
    confirmPassword: string
    onboardingMode: 'TRIAL' | 'SUBSCRIBE'
    planSlug?: string
    cycle?: 'MONTHLY' | 'YEARLY'
    couponCode?: string
  }) => Promise<LoginResponse | CompanyCheckoutResponse>
  updateOwnProfile: (data: Partial<OwnProfileResponse>) => Promise<OwnProfileResponse>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Alasan sesi terakhir diakhiri, disimpan di sessionStorage oleh AuthProvider
 * dan dibaca halaman login. Nilainya saat ini hanya 'idle'.
 */
export const LOGOUT_REASON_KEY = 'ea.logoutReason'
