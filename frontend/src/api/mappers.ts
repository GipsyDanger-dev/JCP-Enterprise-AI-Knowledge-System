import type { ApiDocument, ApiDocumentStatus, ApiRole, ApiUser } from './types'
import type { DocumentItem, DocumentStatus, Role } from '@/types/domain'

/** API: ADMIN | USER → UI: admin | employee */
export function toDomainRole(role: ApiRole): Role {
  return role === 'ADMIN' ? 'admin' : 'employee'
}

/** UI: admin | employee → API: ADMIN | USER */
export function toApiRole(role: Role): ApiRole {
  return role === 'admin' ? 'ADMIN' : 'USER'
}

/** Status dokumen Prisma uppercase → status tampilan UI. */
export function toDomainDocumentStatus(status: ApiDocumentStatus): DocumentStatus {
  switch (status) {
    case 'UPLOADED': return 'Uploaded'
    case 'QUEUED': return 'Queued'
    case 'PROCESSING': return 'Processing'
    case 'READY': return 'Ready'
    case 'FAILED': return 'Failed'
    case 'DELETED': return 'Deleted'
  }
}

/** ApiDocument (backend) → DocumentItem (UI) */
export function toDomainDocument(document: ApiDocument): DocumentItem {
  const version = document.latestVersion ?? document.version
  return {
    id: document.id,
    name: version?.originalFilename ?? document.title,
    updatedAt: document.updatedAt ? formatTimestamp(document.updatedAt) : '',
    status: toDomainDocumentStatus(document.status),
  }
}

/** Konversi ISO datetime -> label singkat, mis. "18 Aug, 10:42". */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = date.getDate()
  const month = date.toLocaleString('en', { month: 'short' })
  const time = date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} ${month}, ${time}`
}

export function toDomainUser(user: ApiUser): { id: string; name: string; email: string; role: Role } {
  return { id: user.id, name: user.displayName, email: user.email, role: toDomainRole(user.role) }
}
