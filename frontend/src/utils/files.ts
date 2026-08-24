import type { AttachmentType, MessageAttachment } from '@/api/types'

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
let attachSeq = 1000

/** Check if a file is an image by MIME type */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
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
