import { Prisma } from '@prisma/client';

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

export interface SaveDocumentFileInput {
  documentVersionId: string;
  content: Uint8Array;
}

export interface DocumentStorage {
  save(transaction: Prisma.TransactionClient, input: SaveDocumentFileInput): Promise<void>;
  read(documentVersionId: string): Promise<Uint8Array>;
  deleteByDocumentId(transaction: Prisma.TransactionClient, documentId: string): Promise<void>;
}
