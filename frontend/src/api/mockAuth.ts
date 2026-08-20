import { ApiError } from './client'
import type { ApiRole, ApiUser, LoginRequest, LoginResponse, MeResponse } from './types'

/**
 * Mock auth — HANYA untuk development (VITE_USE_MOCK_AUTH=true).
 * Meniru perilaku backend: latensi, validasi kredensial, error 401.
 * Ganti dengan API asli dengan mengatur VITE_USE_MOCK_AUTH=false.
 */
const DEMO_ACCOUNTS: Array<{ id: string; email: string; password: string; displayName: string; role: ApiRole }> = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'admin@jcp.co.id', password: 'admin123', displayName: 'Adam', role: 'ADMIN' },
  { id: '00000000-0000-4000-8000-000000000002', email: 'nadia@jcp.co.id', password: 'employee123', displayName: 'Nadia S.', role: 'USER' },
]

const TOKEN_PREFIX = 'mock.'

function delay(ms = 600) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findUser(email: string): (typeof DEMO_ACCOUNTS)[number] | undefined {
  return DEMO_ACCOUNTS.find((account) => account.email === email)
}

export async function mockLogin({ email, password }: LoginRequest): Promise<LoginResponse> {
  await delay()
  const account = findUser(email)
  if (!account || account.password !== password) {
    throw new ApiError(401, 'Email atau password salah.', 'INVALID_CREDENTIALS')
  }
  const user: ApiUser = { id: account.id, displayName: account.displayName, email: account.email, role: account.role }
  const token = `${TOKEN_PREFIX}${btoa(JSON.stringify({ role: user.role, email: user.email }))}`
  return { accessToken: token, tokenType: 'Bearer', user }
}

export async function mockMe(token: string): Promise<MeResponse> {
  await delay(300)
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new ApiError(401, 'Token tidak valid atau kedaluwarsa.', 'UNAUTHORIZED')
  }
  try {
    const payload = JSON.parse(atob(token.slice(TOKEN_PREFIX.length))) as { role: ApiRole; email: string }
    const account = findUser(payload.email)
    if (!account) {
      throw new ApiError(401, 'Token tidak valid atau kedaluwarsa.', 'UNAUTHORIZED')
    }
    return { sub: account.id, email: account.email, role: payload.role }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(401, 'Token tidak valid atau kedaluwarsa.', 'UNAUTHORIZED')
  }
}
