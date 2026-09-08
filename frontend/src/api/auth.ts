import { request } from './client'
import type { CompanyAvailabilityResponse } from './types'
import type { CompanyCheckoutResponse, CompanyRegisterRequest, GoogleLoginRequest, LoginRequest, LoginResponse, MeResponse, PersonalRegisterRequest, OwnProfileResponse } from './types'

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', { method: 'POST', body: credentials })
}

export function loginWithGoogle(credentials: GoogleLoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/google', { method: 'POST', body: credentials })
}

export function registerPersonal(credentials: PersonalRegisterRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/register/personal', { method: 'POST', body: credentials })
}

export function registerCompany(credentials: CompanyRegisterRequest): Promise<LoginResponse | CompanyCheckoutResponse> {
  return request<LoginResponse | CompanyCheckoutResponse>('/auth/register/company', { method: 'POST', body: credentials })
}

export function checkCompanyAvailability(adminUsername: string, adminEmail: string): Promise<CompanyAvailabilityResponse> {
  return request<CompanyAvailabilityResponse>('/auth/register/company/check', {
    method: 'POST',
    body: { adminUsername, adminEmail },
  })
}

export function me(token: string): Promise<MeResponse> {
  return request<MeResponse>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
}

export function updateOwnProfile(token: string, data: Partial<OwnProfileResponse>): Promise<OwnProfileResponse> {
  return request<OwnProfileResponse>('/auth/me/profile', { method: 'PUT', body: data, headers: { Authorization: `Bearer ${token}` } })
}

export function logout(token: string): Promise<void> {
  return request<void>('/auth/logout', { 
    method: 'POST', 
    headers: { Authorization: `Bearer ${token}` } 
  })
}
