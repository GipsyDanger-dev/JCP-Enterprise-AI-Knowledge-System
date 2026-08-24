import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditActorType,
  DocumentStatus,
  ProcessingJobStatus,
  UserRole,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage.interface';
import { UploadedDocumentFile, validateDocumentFile } from './document-file.validator';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(input: CreateDocumentDto, uploadedFile: UploadedDocumentFile, actor: AuthenticatedUser) {
    const file = validateDocumentFile(uploadedFile);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.documentVersion.findFirst({
      where: {
        checksum,
        document: { deletedAt: null },
      },
      select: { documentId: true },
    });
    if (duplicate) throw new ConflictException('This document file has already been uploaded');

    const documentId = randomUUID();
    const documentVersionId = randomUUID();
    const processingJobId = randomUUID();
    const title = input.title?.trim() || file.originalname.slice(0, -extname(file.originalname).length);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.document.create({
        data: {
          id: documentId,
          title,
          collection: input.collection?.trim() || 'Operations',
          status: DocumentStatus.QUEUED,
          uploadedById: actor.sub,
        },
      });
      await transaction.documentVersion.create({
        data: {
          id: documentVersionId,
          documentId,
          versionNumber: 1,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          checksum,
        },
      });
      await this.storage.save(transaction, {
        documentVersionId,
        content: file.buffer,
      });
      await transaction.processingJob.create({
        data: {
          id: processingJobId,
          documentVersionId,
          idempotencyKey: `document-ingestion:${documentVersionId}`,
          status: ProcessingJobStatus.QUEUED,
        },
      });
      await this.auditLogs.record(transaction, {
        actorType: AuditActorType.USER,
        actorUserId: actor.sub,
        action: AuditAction.DOCUMENT_UPLOADED,
        targetType: 'DOCUMENT',
        targetId: documentId,
        metadata: {
          documentVersionId,
          processingJobId,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
      });
    }, { maxWait: 10_000, timeout: 20_000 });

    return {
      id: documentId,
      title,
      collection: input.collection?.trim() || 'Operations',
      status: DocumentStatus.QUEUED,
      version: {
        id: documentVersionId,
        versionNumber: 1,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        checksum,
      },
      processingJob: {
        id: processingJobId,
        status: ProcessingJobStatus.QUEUED,
      },
    };
  }

  async findAll(actor: AuthenticatedUser) {
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        ...(actor.role === UserRole.USER ? { status: DocumentStatus.READY } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        collection: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: {
          select: { id: true, displayName: true },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            originalFilename: true,
            mimeType: true,
            fileSize: true,
            checksum: true,
            _count: {
              select: { chunks: true },
            },
          },
        },
      },
    });

    return documents.map(({ versions, ...document }) => {
      const latestVersion = versions[0];
      if (!latestVersion) return { ...document, latestVersion: null };
      const { _count, ...version } = latestVersion;
      return {
        ...document,
        latestVersion: { ...version, chunkCount: _count.chunks },
      };
    });
  }

  async getStatus(id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            processingJobs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                attemptCount: true,
                errorMessage: true,
                startedAt: true,
                completedAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    const latestVersion = document.versions[0];
    return {
      id: document.id,
      title: document.title,
      status: document.status,
      updatedAt: document.updatedAt,
      version: latestVersion
        ? {
            id: latestVersion.id,
            versionNumber: latestVersion.versionNumber,
            processingJob: latestVersion.processingJobs[0] ?? null,
          }
        : null,
    };
  }

  async download(id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: { id: true, originalFilename: true, mimeType: true },
        },
      },
    });
    if (!document || document.versions.length === 0) throw new NotFoundException('Document not found');
    const version = document.versions[0];
    const content = await this.storage.read(version.id);
    return {
      content: Buffer.from(content),
      filename: version.originalFilename,
      mimeType: version.mimeType,
    };
  }

  async getChunks(id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            chunks: {
              orderBy: { pageNumber: 'asc' },
              select: {
                chunkId: true,
                pageNumber: true,
                sectionTitle: true,
                text: true,
              },
            },
          },
        },
      },
    });
    if (!document) throw new NotFoundException('Document not found');
    const version = document.versions[0];
    return {
      documentId: document.id,
      title: document.title,
      status: document.status,
      chunks: version?.chunks ?? [],
    };
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const deletedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await this.storage.deleteByDocumentId(transaction, id);
      await transaction.processingJob.updateMany({
        where: {
          documentVersion: { documentId: id },
          status: { in: [ProcessingJobStatus.QUEUED, ProcessingJobStatus.PROCESSING] },
        },
        data: {
          status: ProcessingJobStatus.FAILED,
          errorMessage: 'Document deleted before processing completed',
          completedAt: deletedAt,
        },
      });
      await transaction.document.update({
        where: { id },
        data: { status: DocumentStatus.DELETED, deletedAt },
      });
      await this.auditLogs.record(transaction, {
        actorType: AuditActorType.USER,
        actorUserId: actor.sub,
        action: AuditAction.DOCUMENT_DELETED,
        targetType: 'DOCUMENT',
        targetId: id,
      });
    });

    return { id, status: DocumentStatus.DELETED, deletedAt };
  }
}
