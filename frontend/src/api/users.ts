import { authHeaders, request } from './client'
import type { ApiUser, ApiUserReferenceData, CreateUserRequest, UpdateUserRequest } from './types'

export function listUsers(token?: string): Promise<ApiUser[]> {
  return request<ApiUser[]>('/users', { headers: authHeaders(token) })
}

export function getUserReferenceData(token?: string): Promise<ApiUserReferenceData> {
  return request<ApiUserReferenceData>('/users/reference-data', { headers: authHeaders(token) })
}

export function createUser(data: CreateUserRequest, token?: string): Promise<ApiUser> {
  return request<ApiUser>('/users', { method: 'POST', body: data, headers: authHeaders(token) })
}

export function updateUser(id: string, data: UpdateUserRequest, token?: string): Promise<ApiUser> {
  return request<ApiUser>(`/users/${id}`, { method: 'PUT', body: data, headers: authHeaders(token) })
}

export function changePassword(id: string, newPassword: string, token?: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/users/${id}/password`, { method: 'PUT', body: { newPassword }, headers: authHeaders(token) })
}

export function deleteUser(id: string, token?: string): Promise<void> {
  return request<void>(`/users/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}
