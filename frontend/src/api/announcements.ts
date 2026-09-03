import { authHeaders, request } from './client'

export interface Announcement {
  id: string
  title: string
  body: string
  isActive: boolean
  publishedAt: string
  createdAt: string
  updatedAt: string
  createdBy: { id: string; displayName: string }
}

export const listAnnouncements = (token?: string) => request<Announcement[]>('/announcements', { headers: authHeaders(token) })
export const createAnnouncement = (input: Pick<Announcement, 'title' | 'body'>, token?: string) => request<Announcement>('/announcements', { method: 'POST', body: input, headers: authHeaders(token) })
export const updateAnnouncement = (id: string, input: Partial<Pick<Announcement, 'title' | 'body' | 'isActive'>>, token?: string) => request<Announcement>(`/announcements/${id}`, { method: 'PATCH', body: input, headers: authHeaders(token) })
export const getAnnouncementUnreadCount = (token?: string) => request<{ count: number; latestTitle: string | null }>('/announcements/unread', { headers: authHeaders(token) })
export const markAnnouncementsRead = (token?: string) => request<{ ok: boolean; count: number }>('/announcements/read', { method: 'POST', headers: authHeaders(token) })
