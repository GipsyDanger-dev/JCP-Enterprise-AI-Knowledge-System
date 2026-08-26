import { request } from './client'
import type { LoginRequest, LoginResponse, MeResponse } from './types'

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', { method: 'POST', body: credentials })
}

export function me(token: string): Promise<MeResponse> {
  return request<MeResponse>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
}

export function logout(token: string): Promise<void> {
  return request<void>('/auth/logout', { 
    method: 'POST', 
    headers: { Authorization: `Bearer ${token}` } 
  })
}
