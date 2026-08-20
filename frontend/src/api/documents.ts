import { authHeaders, request } from './client'
import { USE_MOCK } from './config'
import { mockDeleteDocument, mockGetDocumentStatus, mockListDocuments, mockUploadDocument } from './mockDocuments'
import type { ApiDocument, DeleteDocumentResponse, DocumentStatusResponse } from './types'

export function listDocuments(token?: string): Promise<ApiDocument[]> {
  return USE_MOCK ? mockListDocuments() : request<ApiDocument[]>('/documents', { headers: authHeaders(token) })
}

export function uploadDocument(file: File, token?: string, title?: string): Promise<ApiDocument> {
  if (USE_MOCK) return mockUploadDocument(file, title)
  const form = new FormData()
  form.append('file', file)
  if (title?.trim()) form.append('title', title.trim())
  return request<ApiDocument>('/documents', { method: 'POST', body: form, headers: authHeaders(token) })
}

export function getDocumentStatus(id: string, token?: string): Promise<DocumentStatusResponse> {
  return USE_MOCK ? mockGetDocumentStatus(id) : request<DocumentStatusResponse>(`/documents/${id}/status`, { headers: authHeaders(token) })
}

export function deleteDocument(id: string, token?: string): Promise<DeleteDocumentResponse> {
  return USE_MOCK ? mockDeleteDocument(id) : request<DeleteDocumentResponse>(`/documents/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}
