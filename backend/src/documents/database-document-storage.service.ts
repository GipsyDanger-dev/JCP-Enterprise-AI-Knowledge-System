import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DocumentStorage, SaveDocumentFileInput } from './document-storage.interface';

@Injectable()
export class DatabaseDocumentStorage implements DocumentStorage {
  constructor(private readonly prisma: PrismaService) {}

  async save(transaction: Prisma.TransactionClient, input: SaveDocumentFileInput): Promise<void> {
    const content = new Uint8Array(input.content.byteLength);
    content.set(input.content);
    await transaction.documentFile.create({
      data: {
        documentVersionId: input.documentVersionId,
        content,
      },
    });
  }

  async read(documentVersionId: string): Promise<Uint8Array> {
    const file = await this.prisma.documentFile.findUnique({
      where: { documentVersionId },
      select: { content: true },
    });
    if (!file) throw new NotFoundException('Document file not found');
    return file.content;
  }

  async deleteByDocumentId(
    transaction: Prisma.TransactionClient,
    documentId: string,
  ): Promise<void> {
    await transaction.documentFile.deleteMany({
      where: {
        documentVersion: {
          is: { documentId },
        },
      },
    });
  }
}
