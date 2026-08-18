import type { ApiDocument, ApiDocumentStatus, ApiRole, ApiUser } from './types'
import type { DocumentItem, DocumentStatus, Role } from '@/types/domain'

/** API: ADMIN | EMPLOYEE → UI: admin | employee */
export function toDomainRole(role: ApiRole): Role {
  return role === 'ADMIN' ? 'admin' : 'employee'
}

/** UI: admin | employee → API: ADMIN | EMPLOYEE */
export function toApiRole(role: Role): ApiRole {
  return role === 'admin' ? 'ADMIN' : 'EMPLOYEE'
}

/** API: queued | processing | ready | failed → UI: Queued | Processing | Ready | Failed */
export function toDomainDocumentStatus(status: ApiDocumentStatus): DocumentStatus {
  switch (status) {
    case 'queued': return 'Queued'
    case 'processing': return 'Processing'
    case 'ready': return 'Ready'
    case 'failed': return 'Failed'
  }
}

/** ApiDocument (backend) → DocumentItem (UI) */
export function toDomainDocument(document: ApiDocument): DocumentItem {
  return {
    id: document.id,
    name: document.name,
    collection: document.collection,
    updatedAt: formatRelativeTime(document.updatedAt),
    status: toDomainDocumentStatus(document.status),
    chunks: document.chunks,
  }
}

/** Konversi ISO datetime → label singkat, mis. "18 Aug, 10:42" */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = date.getDate()
  const month = date.toLocaleString('en', { month: 'short' })
  const time = date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} ${month}, ${time}`
}

export function toDomainUser(user: ApiUser): { id: number; name: string; email: string; role: Role } {
  return { id: user.id, name: user.name, email: user.email, role: toDomainRole(user.role) }
}
