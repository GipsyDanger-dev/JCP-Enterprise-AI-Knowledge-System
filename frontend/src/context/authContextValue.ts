import { createContext } from 'react'
import type { ApiUser } from '@/api/types'

export interface AuthContextValue {
  user: ApiUser | null
  token: string | null
  /** true saat memulihkan sesi dari token tersimpan */
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
