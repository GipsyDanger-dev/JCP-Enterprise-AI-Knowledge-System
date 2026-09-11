import type { ApiRole, ApiRoleLabel } from '@/api/types'

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
 * Nama tampilan sebuah role.
 *
 * `labels` adalah istilah yang dipilih instansi, datang dari server. Kalau
 * belum termuat — halaman yang tidak memanggil /users/reference-data, atau
 * permintaannya masih berjalan — dipakai istilah bawaan, yang sengaja sama
 * persis dengan isi tabel role_labels supaya tidak ada kedipan nama.
 */
export function userRoleLabel(role: ApiRole, labels?: ApiRoleLabel[]): string {
  const dipilih = labels?.find((item) => item.role === role)
  if (dipilih) return dipilih.label
  if (role === 'SUPER_ADMIN') return 'Admin'
  if (role === 'ADMIN_UNIT') return 'Admin Unit'
  if (role === 'PEGAWAI') return 'Pegawai'
  // Nilai lama dari sebelum akses berpindah ke unit kerja.
  return role.replace(/_/g, ' ')
}
