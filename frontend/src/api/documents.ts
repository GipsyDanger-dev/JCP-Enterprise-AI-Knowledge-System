import { API_BASE_URL, authHeaders, request } from './client'
import type {
  ApiDocument,
  ApiDocumentCategory,
  DeleteDocumentResponse,
  DocumentStatusResponse,
} from './types'

export function listDocuments(token?: string): Promise<ApiDocument[]> {
  return request<ApiDocument[]>('/documents', { headers: authHeaders(token) })
}

export interface UploadDocumentOptions {
  title?: string
  /** Kategori/subjek. Menentukan unit kerja mana yang boleh membaca dokumennya. */
  categoryId?: string
  /** Opsional: batasi hanya untuk satu unit kerja. Hanya mempersempit akses. */
  unitKerjaId?: string
}

export function uploadDocument(file: File, token?: string, options: UploadDocumentOptions = {}): Promise<ApiDocument> {
  const form = new FormData()
  form.append('file', file)
  if (options.title?.trim()) form.append('title', options.title.trim())
  if (options.categoryId) form.append('categoryId', options.categoryId)
  if (options.unitKerjaId) form.append('unitKerjaId', options.unitKerjaId)
  return request<ApiDocument>('/documents', { method: 'POST', body: form, headers: authHeaders(token) })
}

/** Hanya kategori yang benar-benar bisa diakses pengguna yang sedang login. */
export function listDocumentCategories(token?: string): Promise<ApiDocumentCategory[]> {
  return request<ApiDocumentCategory[]>('/documents/categories', { headers: authHeaders(token) })
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

/** URL download memakai base URL yang sama dengan request() agar konsisten di LAN/VPS */
function downloadUrl(id: string): string {
  return `${API_BASE_URL}/documents/${id}/download`
}

export async function getDocumentBlob(id: string, token?: string): Promise<Blob> {
  const url = downloadUrl(id)
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!response.ok) throw new Error('Unable to load document')
  return response.blob()
}

export function downloadDocument(id: string, filename: string, token?: string): void {
  const url = downloadUrl(id)
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
