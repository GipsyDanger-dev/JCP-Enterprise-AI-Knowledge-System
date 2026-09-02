import { authHeaders, request } from './client'
import type { ApiDocumentCategory } from './types'

export const listDocumentCategories = (token?: string) => request<ApiDocumentCategory[]>('/documents/categories', { headers: authHeaders(token) })
export const createDocumentCategory = (name: string, token?: string) => request<ApiDocumentCategory>('/documents/categories', { method: 'POST', body: { name }, headers: authHeaders(token) })
