import { ApiError } from './client'
import type { ApiDocument, DeleteDocumentResponse, DocumentStatusResponse } from './types'

/** Mock documents mengikuti casing, UUID, dan bentuk response Backend. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const iso = (date: Date) => date.toISOString()

function version(id: number, filename: string) {
  return {
    id: `10000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    versionNumber: 1,
    originalFilename: filename,
    mimeType: filename.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 1024,
    checksum: `mock-checksum-${id}`,
  }
}

const DOCUMENTS: ApiDocument[] = [
  { id: '20000000-0000-4000-8000-000000000001', title: 'SOP Perjalanan Dinas 2026', updatedAt: iso(new Date('2026-08-18T03:42:00Z')), status: 'READY', latestVersion: version(1, 'SOP Perjalanan Dinas 2026.pdf') },
  { id: '20000000-0000-4000-8000-000000000002', title: 'Kebijakan Keamanan Informasi', updatedAt: iso(new Date('2026-08-18T02:16:00Z')), status: 'READY', latestVersion: version(2, 'Kebijakan Keamanan Informasi.docx') },
  { id: '20000000-0000-4000-8000-000000000003', title: 'Panduan Procurement', updatedAt: iso(new Date('2026-08-17T09:30:00Z')), status: 'PROCESSING', latestVersion: version(3, 'Panduan Procurement.pdf') },
  { id: '20000000-0000-4000-8000-000000000004', title: 'Employee Handbook 2026', updatedAt: iso(new Date('2026-08-16T06:05:00Z')), status: 'READY', latestVersion: version(4, 'Employee Handbook 2026.pdf') },
]

let nextId = 5

function scheduleTransition(id: string, status: ApiDocument['status'], delayMs: number) {
  setTimeout(() => {
    const doc = DOCUMENTS.find((item) => item.id === id)
    if (!doc || doc.status === 'READY' || doc.status === 'FAILED' || doc.status === 'DELETED') return
    doc.status = status
    doc.updatedAt = iso(new Date())
  }, delayMs)
}

scheduleTransition('20000000-0000-4000-8000-000000000003', 'READY', 8000)

export async function mockListDocuments(): Promise<ApiDocument[]> {
  await delay(400)
  return DOCUMENTS.map((doc) => ({ ...doc }))
}

export async function mockUploadDocument(file: File, title?: string): Promise<ApiDocument> {
  await delay(900)
  const numericId = nextId++
  const id = `20000000-0000-4000-8000-${String(numericId).padStart(12, '0')}`
  const documentVersion = version(numericId, file.name)
  const doc: ApiDocument = {
    id,
    title: title?.trim() || file.name.replace(/\.[^.]+$/, ''),
    updatedAt: iso(new Date()),
    status: 'QUEUED',
    version: documentVersion,
    processingJob: {
      id: `30000000-0000-4000-8000-${String(numericId).padStart(12, '0')}`,
      status: 'QUEUED',
    },
  }
  DOCUMENTS.unshift({ ...doc, latestVersion: documentVersion, version: undefined })
  scheduleTransition(id, 'PROCESSING', 1500)
  scheduleTransition(id, 'READY', 4000)
  return doc
}

export async function mockGetDocumentStatus(id: string): Promise<DocumentStatusResponse> {
  await delay(150)
  const doc = DOCUMENTS.find((item) => item.id === id)
  if (!doc) throw new ApiError(404, 'Dokumen tidak ditemukan.', 'NOT_FOUND')
  const documentVersion = doc.latestVersion ?? doc.version
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    updatedAt: doc.updatedAt ?? iso(new Date()),
    version: documentVersion ? {
      id: documentVersion.id,
      versionNumber: documentVersion.versionNumber,
      processingJob: doc.processingJob ? { ...doc.processingJob } : null,
    } : null,
  }
}

export async function mockDeleteDocument(id: string): Promise<DeleteDocumentResponse> {
  await delay(300)
  const index = DOCUMENTS.findIndex((item) => item.id === id)
  if (index === -1) throw new ApiError(404, 'Dokumen tidak ditemukan.', 'NOT_FOUND')
  DOCUMENTS.splice(index, 1)
  return { id, status: 'DELETED', deletedAt: iso(new Date()) }
}
