import { request } from './client'
import { USE_MOCK } from './config'
import { mockLogin, mockMe } from './mockAuth'
import type { LoginRequest, LoginResponse, MeResponse } from './types'

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return USE_MOCK ? mockLogin(credentials) : request<LoginResponse>('/auth/login', { method: 'POST', body: credentials })
}

export function me(token: string): Promise<MeResponse> {
  return USE_MOCK ? mockMe(token) : request<MeResponse>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
}
