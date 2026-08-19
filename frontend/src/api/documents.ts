import { authHeaders, request } from './client'
import { USE_MOCK } from './config'
import { mockDeleteDocument, mockGetDocumentStatus, mockListDocuments, mockUploadDocument } from './mockDocuments'
import type { ApiDocument, DocumentStatusResponse } from './types'

export function listDocuments(token?: string): Promise<ApiDocument[]> {
  return USE_MOCK ? mockListDocuments() : request<ApiDocument[]>('/documents', { headers: authHeaders(token) })
}

export function uploadDocument(file: File, token?: string, collection?: string): Promise<ApiDocument> {
  if (USE_MOCK) return mockUploadDocument(file, collection)
  const form = new FormData()
  form.append('file', file)
  if (collection) form.append('collection', collection)
  return request<ApiDocument>('/documents', { method: 'POST', body: form, headers: authHeaders(token) })
}

export function getDocumentStatus(id: number, token?: string): Promise<DocumentStatusResponse> {
  return USE_MOCK ? mockGetDocumentStatus(id) : request<DocumentStatusResponse>(`/documents/${id}/status`, { headers: authHeaders(token) })
}

export function deleteDocument(id: number, token?: string): Promise<void> {
  return USE_MOCK ? mockDeleteDocument(id) : request<void>(`/documents/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}
