import { authHeaders, request } from './client'
import { USE_MOCK } from './config'
import { mockCreateUser, mockDeleteUser, mockListUsers } from './mockUsers'
import type { ApiUser, CreateUserRequest, UpdateUserRequest } from './types'

export function listUsers(token?: string): Promise<ApiUser[]> {
  if (USE_MOCK) return mockListUsers()
  return request<ApiUser[]>('/users', { headers: authHeaders(token) })
}

export function createUser(data: CreateUserRequest, token?: string): Promise<ApiUser> {
  if (USE_MOCK) return mockCreateUser(data)
  return request<ApiUser>('/users', { method: 'POST', body: data, headers: authHeaders(token) })
}

export function updateUser(id: string, data: UpdateUserRequest, token?: string): Promise<ApiUser> {
  if (USE_MOCK) return mockCreateUser({ ...data, email: '', password: '' } as any).then(u => ({ ...u, id }))
  return request<ApiUser>(`/users/${id}`, { method: 'PUT', body: data, headers: authHeaders(token) })
}

export function changePassword(id: string, newPassword: string, token?: string): Promise<{ success: boolean }> {
  if (USE_MOCK) return Promise.resolve({ success: true })
  return request<{ success: boolean }>(`/users/${id}/password`, { method: 'PUT', body: { newPassword }, headers: authHeaders(token) })
}

export function deleteUser(id: string, token?: string): Promise<void> {
  if (USE_MOCK) return mockDeleteUser(id)
  return request<void>(`/users/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}
