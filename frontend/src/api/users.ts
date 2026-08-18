import { authHeaders, request } from './client'
import type { ApiUser, CreateUserRequest } from './types'

export function listUsers(token?: string): Promise<ApiUser[]> {
  return request<ApiUser[]>('/users', { headers: authHeaders(token) })
}

export function createUser(data: CreateUserRequest, token?: string): Promise<ApiUser> {
  return request<ApiUser>('/users', { method: 'POST', body: data, headers: authHeaders(token) })
}
