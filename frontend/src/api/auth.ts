import { request } from './client'
import type { CompanyAvailabilityResponse } from './types'
import type { CompanyCheckoutResponse, CompanyRegisterRequest, EmailCodeRequest, GoogleLoginRequest, LoginRequest, LoginResponse, MeResponse, PasswordResetCodeResponse, PersonalRegisterRequest, ResetPasswordRequest, VerificationCodeDeliveryResponse, OwnProfileResponse } from './types'

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', { method: 'POST', body: credentials })
}

export function loginWithGoogle(credentials: GoogleLoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/google', { method: 'POST', body: credentials })
}

export function registerPersonal(credentials: PersonalRegisterRequest): Promise<VerificationCodeDeliveryResponse> {
  return request<VerificationCodeDeliveryResponse>('/auth/register/personal', { method: 'POST', body: credentials })
}

export function verifyPersonalRegistration(credentials: EmailCodeRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/register/personal/verify', { method: 'POST', body: credentials })
}

export function requestPasswordReset(email: string): Promise<VerificationCodeDeliveryResponse> {
  return request<VerificationCodeDeliveryResponse>('/auth/password/forgot', { method: 'POST', body: { email } })
}

export function verifyPasswordResetCode(credentials: EmailCodeRequest): Promise<PasswordResetCodeResponse> {
  return request<PasswordResetCodeResponse>('/auth/password/verify-code', { method: 'POST', body: credentials })
}

export function resetPassword(credentials: ResetPasswordRequest): Promise<{ success: true }> {
  return request<{ success: true }>('/auth/password/reset', { method: 'POST', body: credentials })
}

export function registerCompany(credentials: CompanyRegisterRequest): Promise<VerificationCodeDeliveryResponse> {
  return request<VerificationCodeDeliveryResponse>('/auth/register/company', { method: 'POST', body: credentials })
}

export function verifyCompanyRegistration(credentials: EmailCodeRequest): Promise<LoginResponse | CompanyCheckoutResponse> {
  return request<LoginResponse | CompanyCheckoutResponse>('/auth/register/company/verify', { method: 'POST', body: credentials })
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

export function requestOwnEmailRegistration(token: string, email: string): Promise<VerificationCodeDeliveryResponse> {
  return request<VerificationCodeDeliveryResponse>('/auth/me/email', { method: 'POST', body: { email }, headers: { Authorization: `Bearer ${token}` } })
}

export function verifyOwnEmailRegistration(token: string, credentials: EmailCodeRequest): Promise<{ email: string }> {
  return request<{ email: string }>('/auth/me/email/verify', { method: 'POST', body: credentials, headers: { Authorization: `Bearer ${token}` } })
}

export function logout(token: string): Promise<void> {
  return request<void>('/auth/logout', { 
    method: 'POST', 
    headers: { Authorization: `Bearer ${token}` } 
  })
}
