import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage.interface';
import { UploadedDocumentFile, validateDocumentFile } from './document-file.validator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import {
  allowedCategoryFilter,
  canManageForUnit,
  canUploadDocuments,
  documentVisibilityWhere,
} from './document-visibility';

const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, ' ');
const categoryKey = (value: string) => normalizeCategoryName(value).toLocaleLowerCase('id-ID');

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /**
   * Tentukan kategori dan penanda unit kerja untuk dokumen baru, sekaligus
   * memastikan aktor memang berwenang atasnya.
   *
   * Pemeriksaannya sengaja di sini, bukan di guard: guard hanya tahu role,
   * sedangkan aturan sebenarnya bergantung pada kategori dan unit kerja tujuan
   * yang baru diketahui setelah body permintaan dibaca.
   */
  private async resolveUploadScope(input: CreateDocumentDto, actor: AuthenticatedUser) {
    if (!canUploadDocuments(actor)) {
      throw new ForbiddenException('Anda tidak berwenang mengunggah dokumen');
    }

    // Admin unit selalu mengunggah untuk unitnya sendiri. Dibuat sebagai
    // bawaan supaya dokumen internal tidak bocor gara-gara lupa memilih.
    const unitKerjaId = actor.isAdmin
      ? input.unitKerjaId ?? null
      : input.unitKerjaId ?? actor.unitKerjaId ?? null;

    if (!canManageForUnit(actor, unitKerjaId)) {
      throw new ForbiddenException('Anda hanya dapat mengunggah dokumen untuk unit kerja sendiri');
    }

    let category: { id: string; name: string } | null = null;
    if (input.categoryId) {
      category = await this.prisma.documentCategory.findFirst({
        // Admin unit tidak boleh menaruh dokumen di kategori yang unitnya
        // sendiri tidak berhak membacanya.
        where: { id: input.categoryId, ...(allowedCategoryFilter(actor) ?? {}) },
        select: { id: true, name: true },
      });
      if (!category) {
        throw new ForbiddenException('Kategori tidak tersedia untuk unit kerja Anda');
      }
    }

    return { unitKerjaId, category };
  }

  async create(input: CreateDocumentDto, uploadedFile: UploadedDocumentFile, actor: AuthenticatedUser) {
    const { unitKerjaId, category } = await this.resolveUploadScope(input, actor);
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
    // `collection` tinggal label warisan; nama kategori dipakai agar tampilan
    // lama tetap masuk akal tanpa perlu diubah sekarang.
    const collection = category?.name ?? input.collection?.trim() ?? 'Umum';

    await this.prisma.$transaction(async (transaction) => {
      await transaction.document.create({
        data: {
          id: documentId,
          title,
          collection,
          categoryId: category?.id ?? null,
          unitKerjaId,
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
      categoryId: category?.id ?? null,
      unitKerjaId,
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

  /**
   * Kategori yang benar-benar bisa diakses aktor.
   *
   * Kategori yang selalu kosong untuk seseorang tidak ditampilkan sama sekali:
   * filter berisi pilihan yang tak pernah membuahkan hasil hanya membingungkan.
   */
  async listCategories(actor: AuthenticatedUser) {
    return this.prisma.documentCategory.findMany({
      where: allowedCategoryFilter(actor) ?? {},
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


  async findAll(actor: AuthenticatedUser) {
    const documents = await this.prisma.document.findMany({
      where: documentVisibilityWhere(actor),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        collection: true,
        status: true,
        documentType: true,
        legalStatus: true,
        regulationNumber: true,
        regulationYear: true,
        category: { select: { id: true, name: true } },
        unitKerja: { select: { id: true, code: true, name: true } },
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

  async getStatus(id: string, actor: AuthenticatedUser) {
    if (!canUploadDocuments(actor)) {
      throw new ForbiddenException('Status pemrosesan hanya untuk pengunggah dokumen');
    }
    const document = await this.prisma.document.findFirst({
      where: { id, ...documentVisibilityWhere(actor) },
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
      where: { id, ...documentVisibilityWhere(actor) },
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
      where: { id, ...documentVisibilityWhere(actor) },
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
      where: { id, ...documentVisibilityWhere(actor) },
      select: { id: true, unitKerjaId: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (!canManageForUnit(actor, document.unitKerjaId)) {
      throw new ForbiddenException('Dokumen ini di luar wewenang unit kerja Anda');
    }

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
