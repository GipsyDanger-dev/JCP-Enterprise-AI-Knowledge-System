import { authHeaders, request } from './client'
import type { ApiDocument, DeleteDocumentResponse, DocumentStatusResponse } from './types'

export function listDocuments(token?: string): Promise<ApiDocument[]> {
  return request<ApiDocument[]>('/documents', { headers: authHeaders(token) })
}

export function uploadDocument(file: File, token?: string, title?: string): Promise<ApiDocument> {
  const form = new FormData()
  form.append('file', file)
  if (title?.trim()) form.append('title', title.trim())
  return request<ApiDocument>('/documents', { method: 'POST', body: form, headers: authHeaders(token) })
}

export function getDocumentStatus(id: string, token?: string): Promise<DocumentStatusResponse> {
  return request<DocumentStatusResponse>(`/documents/${id}/status`, { headers: authHeaders(token) })
}

export function deleteDocument(id: string, token?: string): Promise<DeleteDocumentResponse> {
  return request<DeleteDocumentResponse>(`/documents/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}
