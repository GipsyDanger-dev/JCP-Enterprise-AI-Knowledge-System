import { authHeaders, request } from './client'
import { USE_MOCK } from './config'
import { mockCreateUser, mockDeleteUser, mockListUsers } from './mockUsers'
import type { ApiUser, CreateUserRequest } from './types'

export function listUsers(token?: string): Promise<ApiUser[]> {
  if (USE_MOCK) return mockListUsers()
  return request<ApiUser[]>('/users', { headers: authHeaders(token) })
}

export function createUser(data: CreateUserRequest, token?: string): Promise<ApiUser> {
  if (USE_MOCK) return mockCreateUser(data)
  return request<ApiUser>('/users', { method: 'POST', body: data, headers: authHeaders(token) })
}

export function deleteUser(id: number, token?: string): Promise<void> {
  if (USE_MOCK) return mockDeleteUser(id)
  return request<void>(`/users/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}
