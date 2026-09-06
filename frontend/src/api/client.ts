/**
 * Base API client untuk Enterprise AI Knowledge System.
 * Semua request backend melewati helper ini agar:
 * - base URL konsisten (VITE_API_BASE_URL, fallback ke local dev)
 * - error object konsisten ({ error: { code, message } }) per kontrak modul
 * - response typed sesuai schema di src/api/types.ts
 */

/**
 * Resolusi base URL backend - satu-satunya sumber kebenaran untuk seluruh frontend.
 * Memakai cek truthy (bukan `??`) supaya VITE_API_BASE_URL yang kosong atau berisi
 * whitespace tetap jatuh ke fallback, bukan menghasilkan URL yang salah.
 */
function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return `http://${window.location.hostname}:8000`
}

export const API_BASE_URL = resolveApiBaseUrl()

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

type ErrorBody = {
  statusCode?: number
  message?: string | string[]
  error?: string
}

/** Pesan error yang ramah pengguna (401/403/network) */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sesi login tidak valid. Silakan masuk kembali.'
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
    const backendMessage = Array.isArray(errorBody?.message)
      ? errorBody.message.join(', ')
      : errorBody?.message
    throw new ApiError(response.status, backendMessage ?? response.statusText, errorBody?.error)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
