import { request } from './client'
import { mockLogin, mockMe } from './mockAuth'
import type { LoginRequest, LoginResponse, MeResponse } from './types'

/**
 * true = pakai mock auth (tanpa backend).
 * Default aktif di development; matikan dengan VITE_USE_MOCK_AUTH=false.
 * Di produksi hanya aktif bila eksplisit VITE_USE_MOCK_AUTH=true.
 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_AUTH === 'true'
  || (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_AUTH !== 'false')

export function isMockAuth(): boolean {
  return USE_MOCK
}

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return USE_MOCK ? mockLogin(credentials) : request<LoginResponse>('/auth/login', { method: 'POST', body: credentials })
}

export function me(token: string): Promise<MeResponse> {
  return USE_MOCK ? mockMe(token) : request<MeResponse>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
}
