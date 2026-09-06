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
  /** Jumlah pegawai yang sudah membaca. Null untuk yang tidak berhak melihat laporannya. */
  readCount: number | null
}

export interface AnnouncementReader {
  userId: string
  displayName: string
  employeeNumber: string
  division: string
  jobTitle: string
  unitKerja: string | null
  /** Null berarti belum membaca. */
  readAt: string | null
}

export interface AnnouncementReadReport {
  announcementId: string
  title: string
  publishedAt: string
  /** Seluruh pegawai aktif yang menjadi sasaran, tanpa penerbitnya sendiri. */
  total: number
  readCount: number
  readers: AnnouncementReader[]
  pending: AnnouncementReader[]
}

export const listAnnouncements = (token?: string) => request<Announcement[]>('/announcements', { headers: authHeaders(token) })
export const createAnnouncement = (input: Pick<Announcement, 'title' | 'body'>, token?: string) => request<Announcement>('/announcements', { method: 'POST', body: input, headers: authHeaders(token) })
export const updateAnnouncement = (id: string, input: Partial<Pick<Announcement, 'title' | 'body' | 'isActive'>>, token?: string) => request<Announcement>(`/announcements/${id}`, { method: 'PATCH', body: input, headers: authHeaders(token) })
export const getAnnouncementUnreadCount = (token?: string) => request<{ count: number; latestTitle: string | null }>('/announcements/unread', { headers: authHeaders(token) })
export const markAnnouncementsRead = (token?: string) => request<{ ok: boolean; count: number }>('/announcements/read', { method: 'POST', headers: authHeaders(token) })
/**
 * Wewenang menerbitkan ditanyakan ke server, bukan disimpulkan dari jabatan di
 * sisi klien: daftar jabatan yang berhak hanya ada satu salinan, di backend,
 * jadi tidak ada tombol yang muncul untuk orang yang permintaannya akan ditolak.
 */
export const getAnnouncementPermissions = (token?: string) => request<{ canPublish: boolean }>('/announcements/permissions', { headers: authHeaders(token) })
export const getAnnouncementReaders = (id: string, token?: string) => request<AnnouncementReadReport>(`/announcements/${id}/readers`, { headers: authHeaders(token) })
