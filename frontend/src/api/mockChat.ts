/**
 * Mock chat — HANYA untuk development (USE_MOCK=true).
 * Ganti dengan API asli saat VITE_USE_MOCK_AUTH=false.
 *
 * Simulasi: delay 800-1500ms, citation dari dokumen yang sudah ada,
 * dan no-answer untuk pertanyaan yang tidak relevan.
 */
import type { Citation, ChatQueryResponse } from './types'

let conversationSeq = 100

const mockId = (prefix: number, value: number) =>
  `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, '0')}`

/** Database jawaban mock — dipilih berdasarkan keyword di pertanyaan */
const answers: Array<{
  keywords: string[]
  answer: string
  citations: Citation[]
}> = [
  {
    keywords: ['hotel', 'penginapan', 'akomodasi', 'menginap'],
    answer:
      'Manajer level diizinkan biaya hotel maksimal Rp900.000 per malam. Kebijakan mensyaratkan kwitansi detail dan persetujuan terlebih dahulu untuk pengecualian.',
    citations: [
      {
        documentId: mockId(2, 1),
        documentVersionId: mockId(1, 1),
        filename: 'SOP Perjalanan Dinas 2026.pdf',
        version: 2,
        pageNumber: 7,
        sectionTitle: 'Hotel Allowance',
        chunkId: 'mock-chunk-42',
        excerpt: 'Manajer level diizinkan biaya hotel maksimal Rp900.000 per malam dengan syarat kwitansi detail dan persetujuan atasan langsung.',
      },
      {
        documentId: mockId(2, 3),
        documentVersionId: mockId(1, 3),
        filename: 'Kebijakan Perjalanan Bisnis.pdf',
        pageNumber: 12,
        sectionTitle: 'Biaya Akomodasi',
        chunkId: 'mock-chunk-87',
        excerpt: 'Seluruh biaya akomodasi harus sesuai dengan standar perusahaan dan tidak melebihi batas yang ditetapkan untuk masing-masing level jabatan.',
      },
    ],
  },
  {
    keywords: ['cuti', 'libur', 'holiday', 'leave', 'rehat'],
    answer:
      'Karyawan berhak atas 12 hari cuti tahunan. Cuti tambahan dapat diajukan untuk keperluan keluarga dengan persetujuan langsung dari HR.',
    citations: [
      {
        documentId: mockId(2, 2),
        documentVersionId: mockId(1, 2),
        filename: 'Panduan Karyawan 2026.pdf',
        pageNumber: 23,
        sectionTitle: 'Cuti Tahunan',
        chunkId: 'mock-chunk-115',
        excerpt: 'Setiap karyawan berhak atas 12 hari cuti tahunan. Pengajuan cuti harus disampaikan minimal 3 hari sebelum tanggal cuti yang dikehendaki.',
      },
    ],
  },
  {
    keywords: ['reimburse', 'klaim', 'expense', 'biaya', 'uang'],
    answer:
      'Pengajuan reimbursement harus dilakukan dalam 7 hari kerja setelah pengeluaran. Lampirkan bukti pembayaran asli dan formulir klaim yang sudah disetujui atasan.',
    citations: [
      {
        documentId: mockId(2, 3),
        documentVersionId: mockId(1, 3),
        filename: 'Kebijakan Perjalanan Bisnis.pdf',
        pageNumber: 5,
        sectionTitle: 'Prosedur Reimbursement',
        chunkId: 'mock-chunk-31',
        excerpt: 'Pengajuan reimbursement harus dilakukan dalam 7 hari kerja setelah pengeluaran. Lampirkan bukti pembayaran asli dan formulir klaim yang sudah disetujui atasan.',
      },
    ],
  },
  {
    keywords: ['gaji', 'upah', 'salary', 'payroll', 'tunjangan'],
    answer:
      'Pembayaran gaji dilakukan pada tanggal 25 setiap bulan melalui transfer bank. Tunjangan transportasi dan makan sudah termasuk dalam paket kompensasi.',
    citations: [
      {
        documentId: mockId(2, 2),
        documentVersionId: mockId(1, 2),
        filename: 'Panduan Karyawan 2026.pdf',
        pageNumber: 8,
        sectionTitle: 'Kompensasi & Tunjangan',
        chunkId: 'mock-chunk-52',
        excerpt: 'Pembayaran gaji dilakukan pada tanggal 25 setiap bulan melalui transfer bank. Tunjangan transportasi dan makan sudah termasuk dalam paket kompensasi.',
      },
    ],
  },
  {
    keywords: ['attendance', 'absen', 'presensi', 'hadir', 'clock'],
    answer:
      'Sistem presensi menggunakan fingerprint yang tersedia di setiap lantai. Keterlambatan lebih dari 15 menit akan tercatat otomatis dan mempengaruhi evaluasi kinerja.',
    citations: [
      {
        documentId: mockId(2, 2),
        documentVersionId: mockId(1, 2),
        filename: 'Panduan Karyawan 2026.pdf',
        pageNumber: 3,
        sectionTitle: 'Kehadiran & Presensi',
        chunkId: 'mock-chunk-12',
        excerpt: 'Sistem presensi menggunakan fingerprint yang tersedia di setiap lantai. Keterlambatan lebih dari 15 menit akan tercatat otomatis.',
      },
    ],
  },
]

function pickAnswer(question: string): ChatQueryResponse {
  const q = question.toLowerCase()

  for (const entry of answers) {
    if (entry.keywords.some((kw) => q.includes(kw))) {
      return {
        conversationId: mockId(4, conversationSeq++),
        answer: entry.answer,
        citations: entry.citations,
      }
    }
  }

  // No-answer: pertanyaan tidak relevan dengan dokumen yang ada
  return {
    conversationId: mockId(4, conversationSeq++),
    answer: null,
    message:
      'Informasi tidak ditemukan pada dokumen yang tersedia di knowledge base saat ini.',
    citations: [],
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function mockChatQuery(question: string): Promise<ChatQueryResponse> {
  await delay(800 + Math.random() * 700)
  return pickAnswer(question)
}
