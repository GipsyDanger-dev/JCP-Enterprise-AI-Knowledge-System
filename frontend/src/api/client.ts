/**
 * Base API client untuk Enterprise AI Knowledge System.
 * Semua request backend melewati helper ini agar:
 * - base URL konsisten (VITE_API_BASE_URL, fallback ke local dev)
 * - error object konsisten ({ error: { code, message } }) per kontrak modul
 * - response typed sesuai schema di src/api/types.ts
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Dikirim sebagai JSON, kecuali FormData (mis. upload file) */
  body?: unknown
}

/** Header otorisasi Bearer — dipakai endpoint yang butuh login */
export function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type ErrorBody = { error?: { code?: string; message?: string } }

/** Pesan error yang ramah pengguna (401/403/network) */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Email atau password salah.'
    if (error.status === 403) return 'Akun Anda tidak memiliki akses.'
    return error.message
  }
  return 'Tidak dapat terhubung ke server. Pastikan backend berjalan.'
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...rest } = options
  const headers = new Headers(rest.headers)

  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    // Jangan set Content-Type: browser yang mengisi boundary-nya
    payload = body
  } else if (body !== undefined) {
    payload = JSON.stringify(body)
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers, body: payload })

  if (!response.ok) {
    let errorBody: ErrorBody | null = null
    try {
      errorBody = (await response.json()) as ErrorBody
    } catch {
      // response bukan JSON — biarkan null
    }
    throw new ApiError(response.status, errorBody?.error?.message ?? response.statusText, errorBody?.error?.code)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
