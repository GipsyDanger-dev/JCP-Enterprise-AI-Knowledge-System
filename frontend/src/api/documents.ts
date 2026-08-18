import { authHeaders, request } from './client'
import type { ApiDocument, DocumentStatusResponse } from './types'

export function listDocuments(token?: string): Promise<ApiDocument[]> {
  return request<ApiDocument[]>('/documents', { headers: authHeaders(token) })
}

export function uploadDocument(file: File, token?: string): Promise<ApiDocument> {
  const form = new FormData()
  form.append('file', file)
  return request<ApiDocument>('/documents', { method: 'POST', body: form, headers: authHeaders(token) })
}

export function getDocumentStatus(id: number, token?: string): Promise<DocumentStatusResponse> {
  return request<DocumentStatusResponse>(`/documents/${id}/status`, { headers: authHeaders(token) })
}

export function deleteDocument(id: number, token?: string): Promise<void> {
  return request<void>(`/documents/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}
