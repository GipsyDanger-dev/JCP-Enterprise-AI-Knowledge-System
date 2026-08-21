import { BadRequestException } from '@nestjs/common';
import { extname, posix } from 'node:path';

export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024;

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const PDF_MIME_TYPES = new Set(['application/pdf', 'application/octet-stream']);
const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
  'application/zip',
]);

export function validateDocumentFile(file?: UploadedDocumentFile): UploadedDocumentFile {
  if (!file) throw new BadRequestException('A PDF or DOCX file is required');
  if (file.size === 0) throw new BadRequestException('The uploaded file is empty');
  if (file.size > MAX_DOCUMENT_FILE_SIZE) {
    throw new BadRequestException('The uploaded file exceeds the 10 MB limit');
  }

  const filename = safeFilename(file.originalname);
  if (Buffer.byteLength(filename, 'utf8') > 255) {
    throw new BadRequestException('The filename is too long');
  }

  const extension = extname(filename).toLowerCase();
  const isPdf = extension === '.pdf' && PDF_MIME_TYPES.has(file.mimetype) && hasPdfSignature(file.buffer);
  const isDocx =
    extension === '.docx' && DOCX_MIME_TYPES.has(file.mimetype) && hasZipSignature(file.buffer);

  if (!isPdf && !isDocx) {
    throw new BadRequestException('Only valid PDF or DOCX files are allowed');
  }

  return { ...file, originalname: filename };
}

export function safeFilename(filename: string): string {
  return posix.basename(filename.replace(/\\/g, '/'));
}

function hasPdfSignature(content: Buffer): boolean {
  return content.subarray(0, 5).toString('ascii') === '%PDF-';
}

function hasZipSignature(content: Buffer): boolean {
  if (content.length < 4 || content[0] !== 0x50 || content[1] !== 0x4b) return false;
  const signature = `${content[2]}:${content[3]}`;
  return signature === '3:4' || signature === '5:6' || signature === '7:8';
}
