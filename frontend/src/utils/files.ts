import type { AttachmentType, MessageAttachment } from '@/api/types'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
let attachSeq = 1000

const RENDERABLE_IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])

/** Check if a file is an image by MIME type */
export function isImageFile(file: File): boolean {
  return RENDERABLE_IMAGE_TYPES.has(file.type)
}

/** Get attachment type from file */
export function getAttachmentType(file: File): AttachmentType {
  return isImageFile(file) ? 'image' : 'file'
}

/** Read a file as data URL so the attachment can be rendered or downloaded. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Sisi terpanjang gambar setelah dikecilkan — cukup tajam untuk layar penuh. */
const IMAGE_MAX_DIMENSION = 1600
/** Gambar sekecil ini dibiarkan apa adanya; mengodenya ulang hanya menurunkan mutunya. */
const IMAGE_KEEP_AS_IS_SIZE = 300 * 1024
const IMAGE_QUALITY = 0.82

/** Baca blob hasil kompresi jadi data URL, bentuk yang diterima backend. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/** Decode lewat createImageBitmap bila ada — lebih murah daripada <img> yang harus masuk DOM. */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Sebagian browser menolak format tertentu di sini; <img> di bawah masih bisa.
    }
  }
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'))
      img.src = objectUrl
    })
  } finally {
    // Aman dicabut begitu gambarnya selesai dimuat: datanya sudah ada di memori.
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Gambar yang dikecilkan dan dikodekan ulang, sebagai data URL.
 *
 * Dipakai untuk gambar yang ikut tersimpan di baris datanya sendiri, bukan
 * sebagai berkas terpisah: di sana satu foto kamera 4 MB menjadi ~4 MB teks
 * base64 yang ikut terkirim setiap kali daftarnya dibuka, dan tidak bisa
 * di-cache browser seperti gambar ber-URL. Menahannya di ~1600px sudah cukup
 * untuk ditampilkan sebesar layar, sekaligus memangkas ukurannya belasan kali.
 *
 * Aslinya dikembalikan apa adanya kalau hasil kompresinya tidak lebih kecil,
 * supaya usaha ini tidak pernah berbalik merugikan.
 */
export async function imageFileToCompressedDataUrl(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name}" melebihi batas maksimal 10 MB.`)
  }
  // GIF dilewatkan: menggambarnya ulang di canvas hanya menyalin bingkai
  // pertama, jadi gambar bergerak akan diam-diam berubah jadi gambar diam.
  if (file.type === 'image/gif') return readFileAsDataUrl(file)

  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decodeImage(file)
  } catch {
    // Gagal decode bukan alasan menolak unggahannya — biar backend yang menilai.
    return readFileAsDataUrl(file)
  }

  try {
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height
    if (!width || !height) return readFileAsDataUrl(file)

    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(width, height))
    if (scale === 1 && file.size <= IMAGE_KEEP_AS_IS_SIZE) return readFileAsDataUrl(file)

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) return readFileAsDataUrl(file)
    context.drawImage(source, 0, 0, canvas.width, canvas.height)

    let blob = await canvasToBlob(canvas, 'image/webp', IMAGE_QUALITY)
    if (!blob || blob.type !== 'image/webp') {
      // Browser yang belum bisa mengodekan WebP diam-diam mengembalikan PNG,
      // yang untuk foto justru lebih besar daripada aslinya. JPEG tidak punya
      // alpha, jadi bagian tembus pandang dialasi putih dulu agar tidak hitam.
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_QUALITY)
    }
    if (!blob || blob.size >= file.size) return readFileAsDataUrl(file)
    return await blobToDataUrl(blob)
  } finally {
    if (!(source instanceof HTMLImageElement)) source.close()
  }
}

/** Convert a File to a MessageAttachment. Throws if file > 10MB. */
export async function fileToAttachment(file: File): Promise<MessageAttachment> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File "${file.name}" melebihi batas maksimal 10 MB.`)
  }
  const dataUrl = await readFileAsDataUrl(file)
  return {
    id: attachSeq++,
    type: getAttachmentType(file),
    name: file.name,
    dataUrl,
    size: file.size,
    mimeType: file.type,
  }
}

/** Format file size for display */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Get file icon emoji based on MIME type */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊'
  if (mimeType.startsWith('video/')) return '🎬'
  if (mimeType.startsWith('audio/')) return '🎵'
  return '📎'
}
