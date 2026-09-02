import { authHeaders, request } from './client'
export interface RequiredReading { id: string; documentId: string; progress: number; completedAt: string | null; document: { title: string; collection: string | null } }
export interface RequiredReadingReport { documentId: string; title: string; total: number; completed: number; progress: number; readers: Array<{ userId: string; displayName: string; employeeNumber: string; division: string; jobTitle: string; progress: number; completedAt: string | null }> }
export const assignRequiredReading = (documentId: string, userIds: string[], token?: string) => request<{ assigned: number }>(`/required-readings/documents/${documentId}/assign`, { method: 'POST', body: { userIds }, headers: authHeaders(token) })
export const listMyRequiredReadings = (token?: string) => request<RequiredReading[]>('/required-readings/mine', { headers: authHeaders(token) })
export const updateRequiredReadingProgress = (id: string, progress: number, token?: string) => request<RequiredReading>(`/required-readings/${id}/progress`, { method: 'POST', body: { progress }, headers: authHeaders(token) })
export const completeRequiredReading = (id: string, token?: string) => request<RequiredReading>(`/required-readings/${id}/complete`, { method: 'POST', headers: authHeaders(token) })
export const requiredReadingReport = (token?: string) => request<RequiredReadingReport[]>('/required-readings/report', { headers: authHeaders(token) })
