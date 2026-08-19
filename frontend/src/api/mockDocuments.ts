import { ApiError } from './client'
import type { ApiDocument, DocumentStatusResponse } from './types'

/**
 * Mock dokumen — HANYA untuk development (USE_MOCK=true).
 * Meniru backend: store in-memory, latensi, dan pipeline processing
 * (queued → processing → ready) yang berjalan otomatis.
 * Ganti dengan API asli saat VITE_USE_MOCK_AUTH=false.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const iso = (date: Date) => date.toISOString()

const DOCUMENTS: ApiDocument[] = [
  { id: 1, name: 'SOP Perjalanan Dinas 2026.pdf', collection: 'Operations', updatedAt: iso(new Date('2026-08-18T03:42:00Z')), status: 'ready', chunks: 42 },
  { id: 2, name: 'Kebijakan Keamanan Informasi.docx', collection: 'IT & Security', updatedAt: iso(new Date('2026-08-18T02:16:00Z')), status: 'ready', chunks: 28 },
  { id: 3, name: 'Panduan Procurement.pdf', collection: 'Finance', updatedAt: iso(new Date('2026-08-17T09:30:00Z')), status: 'processing', chunks: null },
  { id: 4, name: 'Employee Handbook 2026.pdf', collection: 'People', updatedAt: iso(new Date('2026-08-16T06:05:00Z')), status: 'ready', chunks: 61 },
]

let nextId = 5

/** Jadwalkan transisi status; no-op bila dokumen sudah final/terhapus */
function scheduleTransition(id: number, status: ApiDocument['status'], delayMs: number) {
  setTimeout(() => {
    const doc = DOCUMENTS.find((item) => item.id === id)
    if (!doc || doc.status === 'ready' || doc.status === 'failed') return
    doc.status = status
    if (status === 'ready') {
      doc.chunks = 15 + Math.floor(Math.random() * 45)
      doc.updatedAt = iso(new Date())
    }
  }, delayMs)
}

// Dokumen seed ber-status processing → selesai otomatis
scheduleTransition(3, 'ready', 8000)

export async function mockListDocuments(): Promise<ApiDocument[]> {
  await delay(400)
  return DOCUMENTS.map((doc) => ({ ...doc }))
}

export async function mockUploadDocument(file: File, collection?: string): Promise<ApiDocument> {
  await delay(900) // simulasi upload
  const doc: ApiDocument = {
    id: nextId++,
    name: file.name,
    collection: collection || 'Unassigned',
    updatedAt: iso(new Date()),
    status: 'queued',
    chunks: null,
  }
  DOCUMENTS.unshift(doc)
  scheduleTransition(doc.id, 'processing', 1500)
  scheduleTransition(doc.id, 'ready', 4000)
  return { ...doc }
}

export async function mockGetDocumentStatus(id: number): Promise<DocumentStatusResponse> {
  await delay(150)
  const doc = DOCUMENTS.find((item) => item.id === id)
  if (!doc) throw new ApiError(404, 'Dokumen tidak ditemukan.', 'NOT_FOUND')
  return { id: doc.id, status: doc.status, error: doc.error ?? null, chunks: doc.chunks }
}

export async function mockDeleteDocument(id: number): Promise<void> {
  await delay(300)
  const index = DOCUMENTS.findIndex((item) => item.id === id)
  if (index === -1) throw new ApiError(404, 'Dokumen tidak ditemukan.', 'NOT_FOUND')
  DOCUMENTS.splice(index, 1)
}
