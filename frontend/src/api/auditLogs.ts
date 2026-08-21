import { authHeaders, request } from './client'

export interface AuditLogEntry {
  id: string
  actorType: string
  actorUserId: string
  actorUser?: { id: string; displayName: string; email: string; role: string }
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
  createdAt: string
}

interface AuditLogResponse {
  data: AuditLogEntry[]
  meta: { total: number; page: number; limit: number }
}

export function listAuditLogs(token?: string, limit = 50): Promise<AuditLogResponse> {
  return request<AuditLogResponse>(`/audit-logs?limit=${limit}`, { headers: authHeaders(token) })
}
