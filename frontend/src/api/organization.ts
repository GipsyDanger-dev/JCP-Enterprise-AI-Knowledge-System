import { authHeaders, request } from './client'
import type { ApiRole, ApiRoleLabel } from './types'

/** Unit kerja beserta berapa banyak yang bergantung padanya. */
export interface OrgUnitKerja {
  id: string
  code: string
  name: string
  isActive: boolean
  /**
   * Sama isinya dengan daftar Orang & akses: akun perusahaan di workspace ini.
   * Akun PERSONAL tidak ikut terhitung di mana pun pada konteks perusahaan.
   */
  userCount: number
  /** Dokumen aktif. Tidak termasuk yang sudah dihapus — lihat di bawah. */
  documentCount: number
  /**
   * Dokumen yang sudah dihapus tapi barisnya masih menunjuk unit ini.
   *
   * Ikut menahan penghapusan meski tidak terlihat di halaman Dokumen. Tanpa
   * angka ini antarmuka tidak bisa menjelaskan kenapa unit yang tertulis
   * "0 dokumen" tetap ditolak.
   */
  deletedDocumentCount: number
}

export interface OrgJabatan {
  id: string
  name: string
  canManageAnnouncements: boolean
  /**
   * Boleh mengunggah dokumen untuk unit kerjanya sendiri, lalu mengubah dan
   * menghapus apa yang ia unggah. Tidak berlaku bagi pemegangnya yang belum
   * ditempatkan di unit kerja mana pun.
   */
  canUploadDocuments: boolean
  canViewAnnouncementReaders: boolean
  isActive: boolean
  sortOrder: number
  userCount: number
}

export interface OrganizationOverview {
  unitKerja: OrgUnitKerja[]
  jabatan: OrgJabatan[]
  roleLabels: ApiRoleLabel[]
}

export type JabatanInput = Partial<Pick<
  OrgJabatan,
  'name' | 'canManageAnnouncements' | 'canViewAnnouncementReaders' | 'canUploadDocuments' | 'isActive' | 'sortOrder'
>>

export const getOrganization = (token?: string) =>
  request<OrganizationOverview>('/organization', { headers: authHeaders(token) })

export const createUnitKerja = (input: { name: string; code: string }, token?: string) =>
  request<OrgUnitKerja>('/organization/unit-kerja', { method: 'POST', body: input, headers: authHeaders(token) })

export const updateUnitKerja = (id: string, input: { name?: string; isActive?: boolean }, token?: string) =>
  request<OrgUnitKerja>(`/organization/unit-kerja/${id}`, { method: 'PUT', body: input, headers: authHeaders(token) })

/**
 * Ditolak backend selama unit ini masih dipakai pengguna atau dokumen — bukan
 * karena cerewet, tetapi karena unit kerja adalah satu-satunya penentu dokumen
 * mana yang terlihat seorang pegawai, dan menghapusnya akan memangkas akses
 * mereka tanpa pesan apa pun. Untuk sekadar menyembunyikannya dari pilihan,
 * pakai updateUnitKerja({ isActive: false }).
 */
export const deleteUnitKerja = (id: string, token?: string) =>
  request<{ id: string; deleted: boolean }>(`/organization/unit-kerja/${id}`, { method: 'DELETE', headers: authHeaders(token) })

export const createJabatan = (input: JabatanInput & { name: string }, token?: string) =>
  request<OrgJabatan>('/organization/jabatan', { method: 'POST', body: input, headers: authHeaders(token) })

export const updateJabatan = (id: string, input: JabatanInput, token?: string) =>
  request<OrgJabatan>(`/organization/jabatan/${id}`, { method: 'PUT', body: input, headers: authHeaders(token) })

/** Sama seperti unit kerja: ditolak selama masih ada yang memegangnya. */
export const deleteJabatan = (id: string, token?: string) =>
  request<{ id: string; deleted: boolean }>(`/organization/jabatan/${id}`, { method: 'DELETE', headers: authHeaders(token) })

/**
 * Hanya mengganti istilahnya. Wewenang tiap role tetap di kode backend, dan
 * role baru memang tidak bisa ditambah — lihat catatan di OrganizationService.
 */
export const updateRoleLabel = (role: ApiRole, input: { label: string; description?: string }, token?: string) =>
  request<ApiRoleLabel>(`/organization/role-labels/${role}`, { method: 'PUT', body: input, headers: authHeaders(token) })
