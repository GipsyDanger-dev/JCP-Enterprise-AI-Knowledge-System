import { JabatanPermissions } from './auth.types';

/**
 * Kolom jabatan yang boleh ikut ke klien: namanya dan centang wewenangnya.
 *
 * `isActive` ikut dibaca meski tidak pernah dikirim keluar — lihat
 * `wewenangJabatan` di bawah.
 */
export const JABATAN_PERMISSION_SELECT = {
  id: true,
  name: true,
  isActive: true,
  canManageAnnouncements: true,
  canViewAnnouncementReaders: true,
  canUploadDocuments: true,
} as const;

/**
 * Wewenang yang benar-benar berlaku dari sebuah baris jabatan.
 *
 * Jabatan yang dinonaktifkan tidak memberi apa pun. Sebelumnya `isActive` tidak
 * pernah dilihat di jalur ini, sehingga menonaktifkan sebuah jabatan hanya
 * menyembunyikannya dari dropdown: pemegangnya tetap boleh mengunggah dokumen
 * dan menerbitkan pengumuman. Baris berstatus mati yang masih membagikan kuasa
 * adalah jebakan — tidak ada yang akan menebaknya saat menelusuri siapa boleh
 * apa.
 *
 * Nama jabatannya tidak ikut hilang dari tampilan: itu disimpan terpisah di
 * kolom teks `users.job_title`, yang memang untuk ditampilkan dan tidak pernah
 * dipakai sebagai dasar wewenang.
 *
 * Dipakai ketiga tempat yang membaca jabatan — login, /auth/me, dan
 * JwtAuthGuard. Disatukan di sini supaya ketiganya tidak bisa menyimpang:
 * satu saja yang lupa menyaring, wewenangnya bocor lewat jalur itu.
 */
export function wewenangJabatan(
  jabatan: (JabatanPermissions & { isActive: boolean }) | null | undefined,
): JabatanPermissions | null {
  if (!jabatan || !jabatan.isActive) return null;
  const { isActive: _isActive, ...wewenang } = jabatan;
  return wewenang;
}
