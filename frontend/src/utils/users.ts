import type { ApiCurrentRole, ApiRole, ApiRoleLabel } from '@/api/types'

export function userInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Role warisan dibaca sebagai salah satu dari ketiga role yang dipakai sekarang.
 *
 * Akun lawas masih menyimpan ADMIN, USER, sampai nama dinas sebagai role. Tanpa
 * diterjemahkan, satu daftar pengguna menampilkan dua istilah untuk wewenang
 * yang sama persis — "ADMIN" bersebelahan dengan "Admin", "USER" dengan
 * "Pegawai" — seolah-olah keduanya hal yang berbeda.
 *
 * Pemetaannya mengikuti isAdminRole() di backend, yang menyamakan ADMIN dengan
 * SUPER_ADMIN dan memperlakukan sisanya sebagai pegawai, jadi tidak ada
 * wewenang yang bergeser hanya karena namanya dirapikan.
 */
export function normalizeRole(role: ApiRole): ApiCurrentRole {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return 'SUPER_ADMIN'
  if (role === 'ADMIN_UNIT') return 'ADMIN_UNIT'
  return 'PEGAWAI'
}

/**
 * Nama tampilan sebuah role.
 *
 * `labels` adalah istilah yang dipilih instansi, datang dari server. Kalau
 * belum termuat — halaman yang tidak memanggil /users/reference-data, atau
 * permintaannya masih berjalan — dipakai istilah bawaan, yang sengaja sama
 * persis dengan isi tabel role_labels supaya tidak ada kedipan nama.
 */
export function userRoleLabel(role: ApiRole, labels?: ApiRoleLabel[]): string {
  const sekarang = normalizeRole(role)
  const dipilih = labels?.find((item) => item.role === sekarang)
  if (dipilih) return dipilih.label
  if (sekarang === 'SUPER_ADMIN') return 'Admin'
  if (sekarang === 'ADMIN_UNIT') return 'Admin Unit'
  return 'Pegawai'
}
