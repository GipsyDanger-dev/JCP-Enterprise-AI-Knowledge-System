import { API_BASE_URL, authHeaders, request } from './client'

export interface Announcement {
  id: string
  title: string
  body: string
  /**
   * Gambarnya tidak ikut di daftar — hanya penandanya. Isinya diambil terpisah
   * lewat getAnnouncementImageBlob supaya bisa di-cache browser; dulu seluruh
   * base64-nya ikut di JSON ini dan terunduh ulang setiap halaman dibuka.
   */
  hasImage: boolean
  isActive: boolean
  publishedAt: string
  createdAt: string
  updatedAt: string
  /** Null bila akun penerbitnya sudah dihapus; pakai createdByName sebagai gantinya. */
  createdBy: {
    id: string
    displayName: string
    jobTitle: string | null
    jabatan: { name: string } | null
  } | null
  /** Salinan identitas penerbit di baris pengumumannya, tetap ada setelah akunnya dihapus. */
  createdByName: string
  createdByUsername: string | null
  /** Jumlah pegawai yang sudah membaca. Null untuk yang tidak berhak melihat laporannya. */
  readCount: number | null
  /** Seluruh pegawai yang menjadi sasaran, tanpa penerbitnya. Null seperti readCount. */
  audienceTotal: number | null
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

/** Isian yang dikirim saat menerbitkan atau menyunting. */
export interface AnnouncementInput {
  title: string
  body: string
  /**
   * Data URL gambar barunya, atau null untuk membuang gambar yang ada.
   *
   * Tidak disertakan sama sekali berarti gambarnya dibiarkan apa adanya — itu
   * yang membuat penyuntingan teks tidak perlu mengunggah ulang gambar yang
   * tidak berubah, dan sejak gambarnya tidak lagi ikut di daftar, klien memang
   * tidak lagi memegang salinannya untuk dikirim balik.
   */
  imageDataUrl?: string | null
}

export const createAnnouncement = (input: AnnouncementInput, token?: string) => request<Announcement>('/announcements', { method: 'POST', body: input, headers: authHeaders(token) })
export const updateAnnouncement = (id: string, input: Partial<AnnouncementInput> & { isActive?: boolean }, token?: string) => request<Announcement>(`/announcements/${id}`, { method: 'PATCH', body: input, headers: authHeaders(token) })

/**
 * Gambar satu pengumuman sebagai blob.
 *
 * Lewat fetch, bukan langsung dipasang di src <img>: endpointnya butuh header
 * Authorization, dan <img> tidak pernah mengirimkannya. Jawaban 304 dari cache
 * browser tetap berlaku di jalur ini, jadi kunjungan kedua tidak mengunduh
 * apa pun.
 */
export async function getAnnouncementImageBlob(id: string, token?: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/announcements/${id}/image`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error('Unable to load announcement image')
  return response.blob()
}
/** Hapus permanen; bukti bacanya ikut terhapus. Untuk sekadar menyembunyikan, pakai updateAnnouncement({ isActive: false }). */
export const deleteAnnouncement = (id: string, token?: string) => request<{ id: string; deleted: boolean }>(`/announcements/${id}`, { method: 'DELETE', headers: authHeaders(token) })
export const getAnnouncementUnreadCount = (token?: string) => request<{ count: number; latestTitle: string | null }>('/announcements/unread', { headers: authHeaders(token) })
export const markAnnouncementsRead = (token?: string) => request<{ ok: boolean; count: number }>('/announcements/read', { method: 'POST', headers: authHeaders(token) })
/**
 * Wewenang ditanyakan ke server, bukan disimpulkan dari jabatan di sisi klien:
 * centang yang menentukannya hanya ada satu salinan, di baris jabatan, jadi
 * tidak ada tombol yang muncul untuk orang yang permintaannya akan ditolak.
 *
 * Menerbitkan dan melihat laporan pembaca adalah dua wewenang terpisah — ada
 * jabatan yang diberi salah satunya saja.
 */
export const getAnnouncementPermissions = (token?: string) => request<{ canPublish: boolean; canViewReaders: boolean }>('/announcements/permissions', { headers: authHeaders(token) })
export const getAnnouncementReaders = (id: string, token?: string) => request<AnnouncementReadReport>(`/announcements/${id}/readers`, { headers: authHeaders(token) })
