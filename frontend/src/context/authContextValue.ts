import { createContext } from 'react'
import type { ApiUser } from '@/api/types'

export interface AuthContextValue {
  user: ApiUser | null
  token: string | null
  /** true saat memulihkan sesi dari token tersimpan */
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  registerPersonal: (displayName: string, email: string, password: string, confirmPassword: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
