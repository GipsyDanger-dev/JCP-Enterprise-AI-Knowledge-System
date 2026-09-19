import type { ApiLegalStatus } from '@/api/types'

/**
 * Label status keberlakuan, satu salinan untuk seluruh antarmuka.
 *
 * Dipakai modal unggah maupun dialog atur akses. Kalau masing-masing menulis
 * daftarnya sendiri, keduanya akan menyimpang diam-diam pada penambahan status
 * berikutnya — dan yang menyimpang adalah keterangan yang dipakai admin untuk
 * memutuskan sebuah dokumen boleh dibaca pegawai atau tidak.
 */
export const LEGAL_STATUSES: readonly ApiLegalStatus[] = ['BERLAKU', 'RANCANGAN', 'DIUBAH', 'DICABUT']

const LABELS: Record<ApiLegalStatus, { id: string; en: string }> = {
  BERLAKU: { id: 'Berlaku', en: 'In force' },
  RANCANGAN: { id: 'Rancangan', en: 'Draft' },
  DIUBAH: { id: 'Diubah', en: 'Amended' },
  DICABUT: { id: 'Dicabut', en: 'Revoked' },
}

export const legalStatusLabel = (status: ApiLegalStatus, isId: boolean) =>
  isId ? LABELS[status].id : LABELS[status].en

/**
 * Keterangan apa yang sebenarnya dilakukan tiap status.
 *
 * Hanya RANCANGAN yang mengubah siapa boleh membaca; sisanya penanda arsip
 * belaka. Perbedaan itu harus terbaca admin sebelum ia memilih, bukan
 * ditemukan setelah dokumen telanjur hilang dari daftar pegawai.
 */
export const legalStatusHint = (status: ApiLegalStatus, isId: boolean) => {
  if (status === 'RANCANGAN') {
    return isId
      ? 'Disembunyikan dari pegawai dan tidak pernah dikutip AI. Pilih ini untuk naskah yang belum ditetapkan.'
      : 'Hidden from employees and never cited by the AI. Use this for text that is not enacted yet.'
  }
  if (status === 'DIUBAH' || status === 'DICABUT') {
    return isId
      ? 'Penanda arsip. Dokumen tetap terbaca pegawai dan masih bisa dikutip AI.'
      : 'An archival label. The document stays readable and can still be cited by the AI.'
  }
  return isId
    ? 'Peraturan yang sedang berlaku. Terbaca seluruh pegawai sesuai penanda unit kerjanya.'
    : 'A regulation currently in force. Readable by every employee, subject to its work-unit tag.'
}
