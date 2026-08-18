/**
 * Kontrak API — Enterprise AI Knowledge System
 * Kesepakatan Frontend ↔ Backend (lihat README.md di folder ini).
 * Role memakai format UPPERCASE: ADMIN | EMPLOYEE.
 */

/* ============ Error ============ */
export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

/* ============ Auth ============ */
export type ApiRole = 'ADMIN' | 'EMPLOYEE'

export interface ApiUser {
  id: number
  name: string
  email: string
  role: ApiRole
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: ApiUser
}

export interface MeResponse {
  user: ApiUser
}

/* ============ Users ============ */
export interface CreateUserRequest {
  name: string
  email: string
  role: ApiRole
  password?: string
}

/* ============ Documents ============ */
export type ApiDocumentStatus = 'queued' | 'processing' | 'ready' | 'failed'

export interface ApiDocument {
  id: number
  name: string
  collection: string
  /** ISO datetime, mis. 2026-08-18T10:42:00Z */
  updatedAt: string
  status: ApiDocumentStatus
  /** Jumlah chunk; null selama belum selesai diproses */
  chunks: number | null
  /** Pesan error saat status = failed */
  error?: string | null
}

export interface DocumentStatusResponse {
  id: number
  status: ApiDocumentStatus
  error?: string | null
}

/* ============ Chat ============ */
export interface Citation {
  documentId: number
  filename: string
  version?: string
  pageNumber: number | null
  sectionTitle: string | null
  chunkId: number
}

export interface ChatQueryRequest {
  question: string
  /** Opsional: lanjutkan percakapan yang sudah ada */
  conversationId?: number
}

export interface ChatQueryResponse {
  conversationId: number
  /** null = no-answer ("informasi tidak ditemukan pada dokumen yang tersedia") */
  answer: string | null
  /** Pesan penjelasan saat answer = null */
  message?: string
  citations: Citation[]
}

export interface ConversationSummary {
  id: number
  title: string
  /** ISO datetime */
  updatedAt: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  /** ISO datetime */
  createdAt: string
}

export interface ConversationDetail {
  id: number
  title: string
  messages: ChatMessage[]
}
