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
  DocumentStatus,
  LegalStatus,
  ProcessingJobStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AuditLogsService, pelakuAktor } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage } from './document-storage.interface';
import { UploadedDocumentFile, validateDocumentFile } from './document-file.validator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { UpdateDocumentCategoryDto } from './dto/update-document-category.dto';
import { UpdateDocumentAccessDto } from './dto/update-document-access.dto';
import { UpdateDocumentLegalStatusDto } from './dto/update-document-legal-status.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import {
  allowedCategoryFilter,
  canManageDocument,
  canManageLegalStatus,
  canTargetUnit,
  canUploadDocuments,
  documentVisibilityWhere,
} from './document-visibility';

const normalizeCategoryName = (value: string) => value.trim().replace(/\s+/g, ' ');
const categoryKey = (value: string) => normalizeCategoryName(value).toLocaleLowerCase('id-ID');

/**
 * Bentuk ringkas satu dokumen, dibalas oleh endpoint yang mengubah sebagian
 * kolomnya. Satu definisi dipakai bersama supaya `applyDocumentAccess` di klien
 * tidak perlu menebak field mana yang ikut pada endpoint yang mana.
 */
const DOCUMENT_SUMMARY_SELECT = {
  id: true,
  title: true,
  collection: true,
  status: true,
  legalStatus: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  unitKerja: { select: { id: true, code: true, name: true } },
} satisfies Prisma.DocumentSelect;

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

    if (!canTargetUnit(actor, unitKerjaId)) {
      throw new ForbiddenException('Anda hanya dapat mengunggah dokumen untuk unit kerja sendiri');
    }

    if (unitKerjaId && !await this.prisma.unitKerja.findFirst({ where: { id: unitKerjaId, workspaceId: actor.workspaceId, isActive: true }, select: { id: true } })) {
      throw new ForbiddenException('Unit is not available in this workspace');
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
        document: { deletedAt: null, workspaceId: actor.workspaceId },
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
          workspaceId: actor.workspaceId,
          title,
          collection,
          categoryId: category?.id ?? null,
          unitKerjaId,
          // Tanpa pilihan dari pengunggah, dokumen berstatus BERLAKU — sama
          // seperti bawaan kolomnya. Yang ditutup di sini adalah kebalikannya:
          // rancangan peraturan dulu tidak punya cara masuk sebagai RANCANGAN,
          // jadi draft apa pun langsung terlihat seluruh pegawai dan ikut
          // dikutip AI.
          legalStatus: input.legalStatus ?? LegalStatus.BERLAKU,
          status: DocumentStatus.QUEUED,
          uploadedById: actor.sub,
          // Salinan identitas pengunggah, ditulis sekali di sini. Tautan ke
          // akunnya boleh putus kemudian; keterangan siapa yang menaikkan
          // dokumen ini tidak boleh ikut hilang bersamanya.
          uploadedByName: actor.displayName ?? actor.username,
          uploadedByUsername: actor.username,
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
        ...pelakuAktor(actor),
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
      legalStatus: input.legalStatus ?? LegalStatus.BERLAKU,
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
    const categories = await this.prisma.documentCategory.findMany({
      where: allowedCategoryFilter(actor) ?? {},
      // Jumlah dokumennya ikut karena dialog kelola kategori memakainya untuk
      // memberi tahu lebih dulu mana yang belum bisa dihapus — menyodorkan
      // tombol hapus yang selalu berakhir ditolak server sama saja dengan
      // menyuruh admin menebak.
      select: { id: true, name: true, createdAt: true, _count: { select: { documents: { where: { deletedAt: null } } } } },
      orderBy: { name: 'asc' },
    });
    return categories.map(({ _count, ...category }) => ({ ...category, documentCount: _count.documents }));
  }

  /**
   * Siapa yang boleh menambah, mengganti nama, dan menghapus kategori.
   *
   * Admin unit sengaja tidak ikut: kategori adalah penanda subjek milik
   * seluruh organisasi, dipakai bersama semua unit. Satu unit yang bisa
   * mengganti namanya akan mengubah tampilan arsip unit lain.
   */
  private pastikanBolehKelolaKategori(actor: AuthenticatedUser) {
    if (!actor.isAdmin && actor.accountType !== 'PERSONAL') throw new ForbiddenException('Insufficient permissions');
  }

  async createCategory(input: CreateDocumentCategoryDto, actor: AuthenticatedUser) {
    this.pastikanBolehKelolaKategori(actor);
    const name = normalizeCategoryName(input.name);
    if (name.length < 2) throw new BadRequestException('Category name must contain at least 2 characters');
    const key = categoryKey(name);
    if (key === 'all') throw new BadRequestException('"All" is reserved for the document filter');
    const existing = await this.prisma.documentCategory.findUnique({ where: { workspaceId_key: { workspaceId: actor.workspaceId, key } }, select: { id: true } });
    if (existing) throw new ConflictException('A category with this name already exists');

    try {
      return await this.prisma.documentCategory.create({
        data: { id: randomUUID(), name, key, workspaceId: actor.workspaceId },
        select: { id: true, name: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Ganti nama kategori.
   *
   * `documents.collection` ikut ditulis ulang dalam satu transaksi. Kolom itu
   * adalah salinan nama kategori yang dipakai daftar dokumen dan penyaringnya;
   * kalau ditinggal, seluruh dokumen kategori ini tetap memakai nama lama yang
   * sudah tidak ada di daftar mana pun, dan penyaringnya berhenti menemukan
   * apa-apa.
   */
  async updateCategory(id: string, input: UpdateDocumentCategoryDto, actor: AuthenticatedUser) {
    this.pastikanBolehKelolaKategori(actor);
    const name = normalizeCategoryName(input.name);
    if (name.length < 2) throw new BadRequestException('Category name must contain at least 2 characters');
    const key = categoryKey(name);
    if (key === 'all') throw new BadRequestException('"All" is reserved for the document filter');

    const category = await this.prisma.documentCategory.findFirst({
      where: { id, workspaceId: actor.workspaceId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    // Bentrok dengan dirinya sendiri bukan bentrok: mengubah "Kepegawaian"
    // menjadi "kepegawaian" menghasilkan kunci yang sama dan tetap boleh.
    const bentrok = await this.prisma.documentCategory.findUnique({
      where: { workspaceId_key: { workspaceId: actor.workspaceId, key } },
      select: { id: true },
    });
    if (bentrok && bentrok.id !== id) throw new ConflictException('A category with this name already exists');

    const [updated] = await this.prisma.$transaction([
      this.prisma.documentCategory.update({
        where: { id },
        data: { name, key },
        select: { id: true, name: true, createdAt: true },
      }),
      this.prisma.document.updateMany({
        where: { categoryId: id, workspaceId: actor.workspaceId },
        data: { collection: name },
      }),
    ]);
    return updated;
  }

  /**
   * Hapus kategori, hanya kalau tidak ada dokumen aktif yang memakainya.
   *
   * Relasinya SetNull, jadi menghapus kategori berisi tidak akan menggugurkan
   * dokumennya — tapi seluruh dokumen itu diam-diam kehilangan penanda
   * subjeknya sekaligus, dan tak ada tombol untuk mengembalikannya. Lebih baik
   * ditolak sambil menyebut angkanya, supaya admin memindahkan dokumennya
   * sendiri dan tahu persis apa yang ia pindahkan.
   *
   * Dokumen yang sudah dihapus tidak ikut menghalangi: penanda subjek pada
   * arsip yang tak lagi tampil di mana pun tidak menentukan apa-apa, dan
   * menjadikannya penghalang berarti kategori lama tidak akan pernah bisa
   * dihapus.
   */
  async removeCategory(id: string, actor: AuthenticatedUser) {
    this.pastikanBolehKelolaKategori(actor);
    const category = await this.prisma.documentCategory.findFirst({
      where: { id, workspaceId: actor.workspaceId },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    const terpakai = await this.prisma.document.count({ where: { categoryId: id, deletedAt: null } });
    if (terpakai > 0) {
      throw new ConflictException(
        `Kategori ini masih dipakai ${terpakai} dokumen. Pindahkan dokumennya ke kategori lain dulu.`,
      );
    }

    await this.prisma.documentCategory.delete({ where: { id } });
    return { id: category.id, name: category.name };
  }

  /**
   * Ubah kategori dan penanda unit kerja sebuah dokumen yang sudah terunggah.
   *
   * Inilah satu-satunya cara mengunci dokumen ke satu unit kerja setelah
   * diunggah, dan juga membukanya kembali. Dokumen tanpa penanda terbuka untuk
   * semua pegawai; begitu ditandai, hanya unit itu yang bisa membaca maupun
   * menanyakannya ke AI.
   *
   * Wewenangnya diperiksa dua kali — pada unit dokumen SEKARANG dan pada unit
   * TUJUAN. Tanpa pemeriksaan kedua, admin satu unit bisa memindahkan dokumen
   * ke unit lain; tanpa yang pertama, ia bisa mengambil alih dokumen unit lain.
   */
  async updateAccess(id: string, input: UpdateDocumentAccessDto, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({
      where: { id, ...documentVisibilityWhere(actor) },
      select: { id: true, categoryId: true, unitKerjaId: true, collection: true, legalStatus: true, uploadedById: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (!canManageDocument(actor, document)) {
      throw new ForbiddenException('Dokumen ini di luar wewenang Anda');
    }

    const nextUnitKerjaId = input.unitKerjaId === undefined ? document.unitKerjaId : input.unitKerjaId;
    if (!canTargetUnit(actor, nextUnitKerjaId)) {
      throw new ForbiddenException('Anda hanya dapat menandai dokumen untuk unit kerja sendiri');
    }
    if (nextUnitKerjaId && nextUnitKerjaId !== document.unitKerjaId) {
      const unit = await this.prisma.unitKerja.findFirst({
        where: { id: nextUnitKerjaId, workspaceId: actor.workspaceId, isActive: true },
        select: { id: true },
      });
      if (!unit) throw new BadRequestException('Unit kerja tidak dikenal atau sudah tidak aktif');
    }

    const nextCategoryId = input.categoryId === undefined ? document.categoryId : input.categoryId;
    let category: { id: string; name: string } | null = null;
    if (nextCategoryId) {
      category = await this.prisma.documentCategory.findFirst({
        where: { id: nextCategoryId, ...(allowedCategoryFilter(actor) ?? {}) },
        select: { id: true, name: true },
      });
      if (!category) throw new ForbiddenException('Kategori tidak tersedia untuk unit kerja Anda');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.document.update({
        where: { id },
        data: {
          categoryId: category?.id ?? null,
          unitKerjaId: nextUnitKerjaId,
          // `collection` adalah label warisan yang dipakai filter di antarmuka.
          // Ikut disesuaikan supaya dokumen tidak menghilang dari filter
          // kategori barunya setelah dipindahkan.
          collection: category?.name ?? document.collection,
        },
        select: DOCUMENT_SUMMARY_SELECT,
      });
      await this.auditLogs.record(transaction, {
        ...pelakuAktor(actor),
        action: AuditAction.DOCUMENT_UPDATED,
        targetType: 'DOCUMENT',
        targetId: id,
        metadata: {
          categoryIdBefore: document.categoryId,
          categoryIdAfter: result.category?.id ?? null,
          unitKerjaIdBefore: document.unitKerjaId,
          unitKerjaIdAfter: result.unitKerja?.id ?? null,
        },
      });
      return result;
    });

    return updated;
  }

  /**
   * Ubah status keberlakuan sebuah dokumen.
   *
   * Berdiri sendiri, bukan bagian dari updateAccess, karena wewenangnya lain:
   * pemegang centang jabatan `canManageLegalStatus` boleh menyentuh status
   * dokumen mana pun yang bisa ia lihat, tetapi tidak boleh memindahkan
   * kategori maupun penanda unitnya.
   *
   * `documentVisibilityWhere` tetap dipakai untuk mencari barisnya, jadi
   * centang itu tidak pernah menjadi jalan menyentuh — atau sekadar memastikan
   * keberadaan — dokumen unit lain.
   */
  async updateLegalStatus(id: string, input: UpdateDocumentLegalStatusDto, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({
      where: { id, ...documentVisibilityWhere(actor) },
      select: { id: true, unitKerjaId: true, legalStatus: true, uploadedById: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (!canManageLegalStatus(actor, document)) {
      throw new ForbiddenException('Anda tidak diberi wewenang mengubah status keberlakuan dokumen');
    }
    if (document.legalStatus === input.legalStatus) {
      // Tidak ada yang berubah; menulis baris audit untuk ini hanya membuat
      // riwayatnya penuh kejadian kosong.
      return this.findOneSummary(id);
    }

    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.document.update({
        where: { id },
        data: { legalStatus: input.legalStatus },
        select: DOCUMENT_SUMMARY_SELECT,
      });
      await this.auditLogs.record(transaction, {
        ...pelakuAktor(actor),
        action: AuditAction.DOCUMENT_UPDATED,
        targetType: 'DOCUMENT',
        targetId: id,
        metadata: {
          legalStatusBefore: document.legalStatus,
          legalStatusAfter: result.legalStatus,
        },
      });
      return result;
    });
  }

  /** Bentuk ringkas yang sama dengan balasan updateLegalStatus, untuk jalur tanpa perubahan. */
  private findOneSummary(id: string) {
    return this.prisma.document.findUniqueOrThrow({ where: { id }, select: DOCUMENT_SUMMARY_SELECT });
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
        // Ikut dikirim supaya pengunggahnya tetap bisa disebut setelah akunnya
        // dihapus, saat relasi uploadedBy di atas sudah kosong.
        uploadedByName: true,
        uploadedByUsername: true,
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

  async update(id: string, input: UpdateDocumentDto, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findFirst({ where: { id, ...documentVisibilityWhere(actor) }, select: { id: true, unitKerjaId: true, uploadedById: true } });
    if (!document) throw new NotFoundException('Document not found');
    if (!canManageDocument(actor, document)) throw new ForbiddenException('Insufficient permissions');
    if (input.title === undefined && input.collection === undefined) throw new BadRequestException('No fields supplied');
    const category = input.collection === undefined ? null : await this.prisma.documentCategory.findFirst({ where: { workspaceId: actor.workspaceId, key: categoryKey(input.collection) }, select: { id: true, name: true } });
    if (input.collection !== undefined && !category) throw new BadRequestException('Category not found in this workspace');
    return this.prisma.document.update({ where: { id, workspaceId: actor.workspaceId }, data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(category ? { categoryId: category.id, collection: category.name } : {}),
    }, select: { id: true, title: true, collection: true, status: true, updatedAt: true } });
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
      select: { id: true, unitKerjaId: true, uploadedById: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (!canManageDocument(actor, document)) {
      throw new ForbiddenException('Dokumen ini di luar wewenang Anda');
    }

    const deletedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await this.storage.deleteByDocumentId(transaction, id);
      // Potongan teks ikut dibuang, bukan hanya berkas aslinya. Isi dokumen
      // tersimpan dua kali — sebagai berkas dan sebagai chunk beserta vektornya
      // — jadi membuang berkasnya saja meninggalkan seluruh teks di database
      // untuk dokumen yang sudah diminta hilang.
      //
      // Aman terhadap riwayat chat: baris Citation menyimpan salinannya sendiri
      // (excerpt, halaman, judul bagian) dan hanya ber-foreign-key ke
      // document_versions, yang tetap ada. Jawaban lama tetap utuh terbaca.
      // Jalur pengambilan AI pun sudah menyaring deleted_at, jadi tidak ada
      // yang kehilangan hasil — yang berubah cuma teksnya tidak lagi disimpan.
      await transaction.documentChunk.deleteMany({
        where: { documentVersion: { documentId: id } },
      });
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
        ...pelakuAktor(actor),
        action: AuditAction.DOCUMENT_DELETED,
        targetType: 'DOCUMENT',
        targetId: id,
      });
    });

    return { id, status: DocumentStatus.DELETED, deletedAt };
  }
}
