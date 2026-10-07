import { createContext } from 'react'
import type { ApiUser, CompanyCheckoutResponse, LoginResponse, OwnProfileResponse, VerificationCodeDeliveryResponse } from '@/api/types'

export interface AuthContextValue {
  user: ApiUser | null
  token: string | null
  /** true saat memulihkan sesi dari token tersimpan */
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  registerPersonal: (displayName: string, username: string, email: string, password: string, confirmPassword: string) => Promise<VerificationCodeDeliveryResponse>
  verifyPersonalRegistration: (email: string, code: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<VerificationCodeDeliveryResponse>
  verifyPasswordResetCode: (email: string, code: string) => Promise<string>
  resetPassword: (resetToken: string, password: string, confirmPassword: string) => Promise<void>
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
  }) => Promise<VerificationCodeDeliveryResponse>
  verifyCompanyRegistration: (email: string, code: string) => Promise<LoginResponse | CompanyCheckoutResponse>
  updateOwnProfile: (data: Partial<OwnProfileResponse>) => Promise<OwnProfileResponse>
  /** Hanya untuk akun yang belum punya email; email yang sudah ada tidak bisa diganti. */
  requestOwnEmailRegistration: (email: string) => Promise<VerificationCodeDeliveryResponse>
  verifyOwnEmailRegistration: (email: string, code: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Alasan sesi terakhir diakhiri, disimpan di sessionStorage oleh AuthProvider
 * dan dibaca halaman login. Nilainya saat ini hanya 'idle'.
 */
export const LOGOUT_REASON_KEY = 'ea.logoutReason'
