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
  return role === 'SUPER_ADMIN' ? 'Admin' : role.replace(/_/g, ' ')
}
