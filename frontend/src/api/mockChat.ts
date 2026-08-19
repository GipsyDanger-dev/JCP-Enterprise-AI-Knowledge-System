/**
 * Mock chat — HANYA untuk development (USE_MOCK=true).
 * Ganti dengan API asli saat VITE_USE_MOCK_AUTH=false.
 *
 * Simulasi: delay 800-1500ms, citation dari dokumen yang sudah ada,
 * dan no-answer untuk pertanyaan yang tidak relevan.
 */
import type { Citation, ChatQueryResponse } from './types'

let conversationSeq = 100

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
        documentId: 1,
        filename: 'SOP Perjalanan Dinas 2026.pdf',
        version: 'v2.1',
        pageNumber: 7,
        sectionTitle: 'Hotel Allowance',
        chunkId: 42,
      },
      {
        documentId: 3,
        filename: 'Kebijakan Perjalanan Bisnis.pdf',
        pageNumber: 12,
        sectionTitle: 'Biaya Akomodasi',
        chunkId: 87,
      },
    ],
  },
  {
    keywords: ['cuti', 'libur', 'holiday', 'leave', 'rehat'],
    answer:
      'Karyawan berhak atas 12 hari cuti tahunan. Cuti tambahan dapat diajukan untuk keperluan keluarga dengan persetujuan langsung dari HR.',
    citations: [
      {
        documentId: 2,
        filename: 'Panduan Karyawan 2026.pdf',
        pageNumber: 23,
        sectionTitle: 'Cuti Tahunan',
        chunkId: 115,
      },
    ],
  },
  {
    keywords: ['reimburse', 'klaim', 'expense', 'biaya', 'uang'],
    answer:
      'Pengajuan reimbursement harus dilakukan dalam 7 hari kerja setelah pengeluaran. Lampirkan bukti pembayaran asli dan formulir klaim yang sudah disetujui atasan.',
    citations: [
      {
        documentId: 3,
        filename: 'Kebijakan Perjalanan Bisnis.pdf',
        pageNumber: 5,
        sectionTitle: 'Prosedur Reimbursement',
        chunkId: 31,
      },
    ],
  },
  {
    keywords: ['gaji', 'upah', 'salary', 'payroll', 'tunjangan'],
    answer:
      'Pembayaran gaji dilakukan pada tanggal 25 setiap bulan melalui transfer bank. Tunjangan transportasi dan makan sudah termasuk dalam paket kompensasi.',
    citations: [
      {
        documentId: 2,
        filename: 'Panduan Karyawan 2026.pdf',
        pageNumber: 8,
        sectionTitle: 'Kompensasi & Tunjangan',
        chunkId: 52,
      },
    ],
  },
  {
    keywords: ['attendance', 'absen', 'presensi', 'hadir', 'clock'],
    answer:
      'Sistem presensi menggunakan fingerprint yang tersedia di setiap lantai. Keterlambatan lebih dari 15 menit akan tercatat otomatis dan mempengaruhi evaluasi kinerja.',
    citations: [
      {
        documentId: 2,
        filename: 'Panduan Karyawan 2026.pdf',
        pageNumber: 3,
        sectionTitle: 'Kehadiran & Presensi',
        chunkId: 12,
      },
    ],
  },
]

function pickAnswer(question: string): ChatQueryResponse {
  const q = question.toLowerCase()

  for (const entry of answers) {
    if (entry.keywords.some((kw) => q.includes(kw))) {
      return {
        conversationId: conversationSeq++,
        answer: entry.answer,
        citations: entry.citations,
      }
    }
  }

  // No-answer: pertanyaan tidak relevan dengan dokumen yang ada
  return {
    conversationId: conversationSeq++,
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
