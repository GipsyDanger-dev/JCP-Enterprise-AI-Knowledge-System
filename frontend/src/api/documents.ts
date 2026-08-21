import { authHeaders, request } from './client'
import type { ApiDocument, DeleteDocumentResponse, DocumentStatusResponse } from './types'

export function listDocuments(token?: string): Promise<ApiDocument[]> {
  return request<ApiDocument[]>('/documents', { headers: authHeaders(token) })
}

export function uploadDocument(file: File, token?: string, title?: string, collection?: string): Promise<ApiDocument> {
  const form = new FormData()
  form.append('file', file)
  if (title?.trim()) form.append('title', title.trim())
  if (collection?.trim()) form.append('collection', collection.trim())
  return request<ApiDocument>('/documents', { method: 'POST', body: form, headers: authHeaders(token) })
}

export function getDocumentStatus(id: string, token?: string): Promise<DocumentStatusResponse> {
  return request<DocumentStatusResponse>(`/documents/${id}/status`, { headers: authHeaders(token) })
}

export function deleteDocument(id: string, token?: string): Promise<DeleteDocumentResponse> {
  return request<DeleteDocumentResponse>(`/documents/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}

export interface DocumentChunk {
  chunkId: string
  pageNumber: number | null
  sectionTitle: string
  text: string
}

export interface DocumentChunksResponse {
  documentId: string
  title: string
  status: string
  chunks: DocumentChunk[]
}

export function getDocumentChunks(id: string, token?: string): Promise<DocumentChunksResponse> {
  return request<DocumentChunksResponse>(`/documents/${id}/chunks`, { headers: authHeaders(token) })
}

export function downloadDocument(id: string, filename: string, token?: string): void {
  const url = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}/documents/${id}/download`
  const a = document.createElement('a')
  a.href = url
  a.setAttribute('download', filename)
  // For auth, we open in new tab (browser handles auth via cookie or we use fetch)
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      a.href = blobUrl
      a.click()
      URL.revokeObjectURL(blobUrl)
    })
    .catch(() => {/* ignore */})
}
