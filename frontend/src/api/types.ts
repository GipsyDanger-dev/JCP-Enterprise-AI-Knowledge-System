/** Kontrak API mengikuti response aktual Backend NestJS/Prisma. */

/* ============ Error ============ */
export interface ApiErrorBody {
  statusCode?: number
  message?: string | string[]
  error?: string
}

/* ============ Auth & Users ============ */
export type ApiRole = 'ADMIN' | 'USER'

export interface ApiUser {
  id: string
  displayName: string
  email: string
  role: ApiRole
  isActive?: boolean
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  user: ApiUser
}

/** Response aktual GET /auth/me adalah payload JWT secara langsung. */
export interface MeResponse {
  sub: string
  email: string
  role: ApiRole
  displayName: string
}

export interface CreateUserRequest {
  displayName: string
  email: string
  role: ApiRole
  password: string
}

/* ============ Documents ============ */
export type ApiDocumentStatus =
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'DELETED'

export type ApiProcessingJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface ApiDocumentVersion {
  id: string
  versionNumber: number
  originalFilename: string
  mimeType?: string
  fileSize?: number
  checksum?: string | null
}

export interface ApiProcessingJob {
  id: string
  status: ApiProcessingJobStatus
  attemptCount?: number
  errorMessage?: string | null
  startedAt?: string | null
  completedAt?: string | null
  updatedAt?: string
}

export interface ApiDocument {
  id: string
  title: string
  status: ApiDocumentStatus
  createdAt?: string
  updatedAt?: string
  uploadedBy?: {
    id: string
    displayName: string
  }
  /** Tersedia pada GET /documents. */
  latestVersion?: ApiDocumentVersion | null
  /** Tersedia pada POST /documents. */
  version?: ApiDocumentVersion
  processingJob?: Pick<ApiProcessingJob, 'id' | 'status'>
}

export interface DocumentStatusResponse {
  id: string
  title: string
  status: ApiDocumentStatus
  updatedAt: string
  version: {
    id: string
    versionNumber: number
    processingJob: ApiProcessingJob | null
  } | null
}

export interface DeleteDocumentResponse {
  id: string
  status: 'DELETED'
  deletedAt: string
}

/* ============ Chat ============ */
export interface Citation {
  documentId: string
  documentVersionId: string
  filename: string
  version?: number
  pageNumber: number | null
  sectionTitle: string | null
  chunkId: string
  excerpt?: string | null
}

export interface ChatQueryRequest {
  question: string
  conversationId?: string
}

export interface ChatQueryResponse {
  conversationId: string
  answer: string | null
  message?: string
  citations: Citation[]
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  latestMessage: {
    id: string
    role: 'USER' | 'ASSISTANT'
    content: string
    createdAt: string
  } | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  createdAt: string
}

export interface ConversationDetail {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}
