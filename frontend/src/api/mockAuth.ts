import { ApiError } from './client'
import type { ApiRole, ApiUser, LoginRequest, LoginResponse } from './types'

/**
 * Mock auth — HANYA untuk development (VITE_USE_MOCK_AUTH=true).
 * Meniru perilaku backend: latensi, validasi kredensial, error 401.
 * Ganti dengan API asli dengan mengatur VITE_USE_MOCK_AUTH=false.
 */
const DEMO_ACCOUNTS: Array<{ email: string; password: string; name: string; role: ApiRole }> = [
  { email: 'admin@jcp.co.id', password: 'admin123', name: 'Adam', role: 'ADMIN' },
  { email: 'nadia@jcp.co.id', password: 'employee123', name: 'Nadia S.', role: 'EMPLOYEE' },
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
  const user: ApiUser = { id: DEMO_ACCOUNTS.indexOf(account) + 1, name: account.name, email: account.email, role: account.role }
  const token = `${TOKEN_PREFIX}${btoa(JSON.stringify({ role: user.role, email: user.email }))}`
  return { token, user }
}

export async function mockMe(token: string): Promise<{ user: ApiUser }> {
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
    return {
      user: { id: DEMO_ACCOUNTS.indexOf(account) + 1, name: account.name, email: account.email, role: payload.role },
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(401, 'Token tidak valid atau kedaluwarsa.', 'UNAUTHORIZED')
  }
}
