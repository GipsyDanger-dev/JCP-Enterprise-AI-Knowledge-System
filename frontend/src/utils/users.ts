import type { ApiRole } from '@/api/types'

export function userInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function userRoleLabel(role: ApiRole): string {
  if (role === 'SUPER_ADMIN') return 'Admin'
  if (role === 'PEGAWAI') return 'Pegawai'
  // Nilai lama dari sebelum akses berpindah ke unit kerja.
  return role.replace(/_/g, ' ')
}
