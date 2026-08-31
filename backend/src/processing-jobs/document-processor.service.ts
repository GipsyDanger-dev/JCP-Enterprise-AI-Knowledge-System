import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DocumentStorage, DOCUMENT_STORAGE } from '../documents/document-storage.interface';
import { aiServiceHeaders, aiServiceUrl } from '../config/env.util';
import { Inject } from '@nestjs/common';

const POLL_INTERVAL_MS = 3000;

@Injectable()
export class DocumentProcessorService implements OnModuleInit {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private readonly aiBaseUrl = aiServiceUrl();
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  onModuleInit() {
    this.logger.log('Document processor polling started');
    setInterval(() => this.processNext(), POLL_INTERVAL_MS);
  }

  private async processNext() {
    if (this.processing) return;
    this.processing = true;

    // Dipegang di luar try: blok catch harus menandai FAILED pada job yang sedang
    // diproses di iterasi ini, bukan sembarang job berstatus PROCESSING.
    let activeJobId: string | null = null;
    let activeDocId: string | null = null;

    try {
      // Find oldest QUEUED job
      const job = await this.prisma.processingJob.findFirst({
        where: {
          status: 'QUEUED',
          documentVersion: { document: { deletedAt: null } },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          documentVersion: {
            select: {
              id: true,
              originalFilename: true,
              document: { select: { id: true, title: true } },
            },
          },
        },
      });

      if (!job) {
        this.processing = false;
        return;
      }

      const versionId = job.documentVersion.id;
      const filename = job.documentVersion.originalFilename;
      const docTitle = job.documentVersion.document.title;
      const docId = job.documentVersion.document.id;

      activeJobId = job.id;
      activeDocId = docId;

      this.logger.log(`Processing: ${filename} (job ${job.id})`);

      // Mark as PROCESSING
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: { status: 'PROCESSING', startedAt: new Date(), attemptCount: { increment: 1 } },
      });
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'PROCESSING' },
      });

      // Read file from storage
      const fileContent = await this.storage.read(versionId);
      const content = Buffer.from(fileContent);

      // Save to temp dir for AI engine ingestion
      const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = join(process.cwd(), 'tmp', versionId);
      mkdirSync(tmpDir, { recursive: true });
      const filePath = join(tmpDir, filename);
      writeFileSync(filePath, content);

      // Call AI engine /ingest
      const ingestResponse = await fetch(`${this.aiBaseUrl}/ingest`, {
        method: 'POST',
        headers: aiServiceHeaders(),
        body: JSON.stringify({
          input_dir: tmpDir,
          document_version_id: versionId,
          embed: true,
        }),
      });

      // Cleanup temp dir
      rmSync(tmpDir, { recursive: true, force: true });

      if (!ingestResponse.ok) {
        const errorText = await ingestResponse.text();
        throw new Error(`AI ingest failed (${ingestResponse.status}): ${errorText}`);
      }

      const result = await ingestResponse.json();
      this.logger.log(`Ingested ${filename}: ${JSON.stringify(result)}`);

      // Jumlah halaman hanya diketahui AI service saat file dibuka, jadi
      // disimpan di sini. Dibiarkan null kalau balasan tidak memuatnya
      // (mis. format yang parser-nya tidak melaporkan halaman).
      const pageCount = Number(result?.documents?.[0]?.page_count);
      if (Number.isInteger(pageCount) && pageCount > 0) {
        await this.prisma.documentVersion.update({
          where: { id: versionId },
          data: { pageCount },
        });
      }

      // Mark as COMPLETED
      const completedAt = new Date();
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', completedAt },
      });
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'READY' },
      });

      this.logger.log(`✅ Completed: ${filename}`);
    } catch (error) {
      this.logger.error(`❌ Processing failed: ${error instanceof Error ? error.message : error}`);

      // Tandai FAILED hanya pada job milik iterasi ini. Kalau kegagalan terjadi
      // sebelum job terpilih (mis. query error), tidak ada yang perlu ditandai.
      if (activeJobId && activeDocId) {
        try {
          await this.prisma.processingJob.update({
            where: { id: activeJobId },
            data: {
              status: 'FAILED',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              completedAt: new Date(),
            },
          });
          await this.prisma.document.update({
            where: { id: activeDocId },
            data: { status: 'FAILED' },
          });
        } catch { /* ignore cleanup errors */ }
      }
    } finally {
      this.processing = false;
    }
  }
}
