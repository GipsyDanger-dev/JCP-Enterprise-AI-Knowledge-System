/**
 * Mock users — HANYA untuk development (USE_MOCK=true).
 * Ganti dengan API asli saat VITE_USE_MOCK_AUTH=false.
 */
import type { ApiUser, ApiRole, CreateUserRequest } from './types'

let seq = 4

const store: ApiUser[] = [
  { id: '00000000-0000-4000-8000-000000000001', displayName: 'Adam', email: 'adam@jcp.co.id', role: 'ADMIN' },
  { id: '00000000-0000-4000-8000-000000000002', displayName: 'Nadia S.', email: 'nadia@jcp.co.id', role: 'USER' },
  { id: '00000000-0000-4000-8000-000000000003', displayName: 'Raka D.', email: 'raka@jcp.co.id', role: 'USER' },
]

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function mockListUsers(): Promise<ApiUser[]> {
  await delay(300 + Math.random() * 200)
  return [...store]
}

export async function mockCreateUser(data: CreateUserRequest): Promise<ApiUser> {
  await delay(400 + Math.random() * 300)
  const existing = store.find((u) => u.email === data.email)
  if (existing) {
    throw { status: 409, code: 'EMAIL_EXISTS', message: 'Email sudah terdaftar' }
  }
  const user: ApiUser = {
    id: `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`,
    displayName: data.displayName,
    email: data.email,
    role: data.role,
  }
  store.push(user)
  return user
}

export async function mockDeleteUser(_id: string): Promise<void> {
  await delay(300)
  const idx = store.findIndex((u) => u.id === _id)
  if (idx !== -1) store.splice(idx, 1)
}

/** Helper: initials dari nama */
export function userInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

/** Helper: label role untuk UI */
export function userRoleLabel(role: ApiRole): string {
  return role === 'ADMIN' ? 'Admin' : 'Employee'
}

/** Helper: akses berdasarkan role */
export function userAccessLabel(role: ApiRole): string {
  return role === 'ADMIN' ? 'Full access' : 'Knowledge library'
}
