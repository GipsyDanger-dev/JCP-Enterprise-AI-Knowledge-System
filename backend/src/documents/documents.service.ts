import {
  BadRequestException,
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
  Prisma,
} from '@prisma/client';
import { isEmployeeRole } from '../auth/role.utils';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage.interface';
import { UploadedDocumentFile, validateDocumentFile } from './document-file.validator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';

const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, ' ');
const categoryKey = (value: string) => normalizeCategoryName(value).toLocaleLowerCase('id-ID');

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
    const collection = await this.resolveCollection(input.collection);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.document.create({
        data: {
          id: documentId,
          title,
          collection,
          division: input.division?.trim() || null,
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
      collection,
      division: input.division?.trim() || null,
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

  async listCategories() {
    return this.prisma.documentCategory.findMany({
      select: { id: true, name: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(input: CreateDocumentCategoryDto) {
    const name = normalizeCategoryName(input.name);
    if (name.length < 2) throw new BadRequestException('Category name must contain at least 2 characters');
    const key = categoryKey(name);
    if (key === 'all') throw new BadRequestException('"All" is reserved for the document filter');
    const existing = await this.prisma.documentCategory.findUnique({ where: { key }, select: { id: true } });
    if (existing) throw new ConflictException('A category with this name already exists');

    try {
      return await this.prisma.documentCategory.create({
        data: { id: randomUUID(), name, key },
        select: { id: true, name: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }
  }

  private async resolveCollection(input?: string) {
    const key = input?.trim() ? categoryKey(input) : null;
    const category = key
      ? await this.prisma.documentCategory.findUnique({ where: { key }, select: { name: true } })
      : await this.prisma.documentCategory.findFirst({ orderBy: { createdAt: 'asc' }, select: { name: true } });
    if (!category) throw new BadRequestException('Select a valid document category');
    return category.name;
  }

  async findAll(actor: AuthenticatedUser) {
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        ...(isEmployeeRole(actor.role)
          ? {
              status: DocumentStatus.READY,
              OR: [{ division: null }, { division: actor.division ?? null }],
            }
          : {}),
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

  async download(id: string, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(isEmployeeRole(actor.role)
          ? {
              status: DocumentStatus.READY,
              OR: [{ division: null }, { division: actor.division ?? null }],
            }
          : {}),
      },
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

  async getChunks(id: string, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(isEmployeeRole(actor.role)
          ? {
              status: DocumentStatus.READY,
              OR: [{ division: null }, { division: actor.division ?? null }],
            }
          : {}),
      },
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
