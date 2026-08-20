import type { ApiRole, ApiUser } from '@/api/types'

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export function userRoleLabel(role: ApiRole): string {
  return role === 'ADMIN' ? 'Admin' : 'Employee'
}

export function userAccessLabel(role: ApiRole): string {
  return role === 'ADMIN' ? 'Full access' : 'Knowledge library'
}

export function userPresentation(user: ApiUser) {
  return {
    name: user.displayName,
    initials: userInitials(user.displayName),
    label: userRoleLabel(user.role),
  }
}
