import { authHeaders, request } from './client'

export interface AppNotification {
  id: string
  type: 'REQUIRED_READING_ASSIGNED' | 'REQUIRED_READING_COMPLETED' | 'ANNOUNCEMENT_PUBLISHED'
  title: string
  body: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationFeed {
  items: AppNotification[]
  unreadCount: number
}

export const listNotifications = (token?: string) => request<NotificationFeed>('/notifications', { headers: authHeaders(token) })
export const markNotificationsRead = (token?: string) => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST', headers: authHeaders(token) })
