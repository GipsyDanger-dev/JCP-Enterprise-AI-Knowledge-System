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
}

export interface CreateUserRequest {
  displayName: string
  email: string
  role: ApiRole
  password?: string
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

/* ============ Chat (target contract; Backend masih skeleton) ============ */
export interface Citation {
  documentId: string
  documentVersionId: string
  filename: string
  version?: number
  pageNumber: number | null
  sectionTitle: string | null
  chunkId: string
  excerpt?: string
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
  updatedAt: string
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
  messages: ChatMessage[]
}

/* ============ Messaging (Employee ↔ Admin) ============ */
export type MessageSender = 'employee' | 'admin'

export type AttachmentType = 'image' | 'file'

export interface MessageAttachment {
  id: number
  type: AttachmentType
  name: string
  /** Data URL for images, or null for files */
  dataUrl: string | null
  size: number
  mimeType: string
}

export interface DirectMessage {
  id: number
  conversationId: number
  sender: MessageSender
  senderName: string
  content: string
  attachments: MessageAttachment[]
  /** ISO datetime */
  createdAt: string
  read: boolean
}

export interface DirectConversation {
  id: number
  employeeId: number
  employeeName: string
  employeeEmail: string
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
}

export interface SendMessageRequest {
  content: string
  attachments?: MessageAttachment[]
}

export interface SendMessageResponse {
  id: number
  conversationId: number
  sender: MessageSender
  senderName: string
  content: string
  attachments: MessageAttachment[]
  createdAt: string
  read: boolean
}
