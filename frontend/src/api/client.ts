/**
 * Base API client untuk Enterprise AI Knowledge System.
 * Semua request backend melewati helper ini agar:
 * - base URL konsisten (VITE_API_BASE_URL, fallback ke local dev)
 * - error object konsisten ({ error: { code, message } }) per kontrak modul
 * - response typed sesuai schema
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

type ErrorBody = { error?: { code?: string; message?: string } }

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let body: ErrorBody | null = null
    try {
      body = (await response.json()) as ErrorBody
    } catch {
      // response bukan JSON — biarkan body null
    }
    throw new ApiError(response.status, body?.error?.message ?? response.statusText, body?.error?.code)
  }

  return (await response.json()) as T
}
