import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DocumentStorage, DOCUMENT_STORAGE } from '../documents/document-storage.interface';
import { Inject } from '@nestjs/common';

const POLL_INTERVAL_MS = 3000;

@Injectable()
export class DocumentProcessorService implements OnModuleInit {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private readonly aiBaseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';
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
              mimeType: true,
              document: { select: { id: true, title: true } },
            },
          },
        },
      });

      if (!job) {
        this.processing = false;
        return;
      }

      activeJobId = job.id;
      activeDocId = job.documentVersion.document.id;
      const versionId = job.documentVersion.id;
      const filename = job.documentVersion.originalFilename;
      const mimeType = job.documentVersion.mimeType ?? 'application/octet-stream';
      const docTitle = job.documentVersion.document.title;
      const docId = job.documentVersion.document.id;

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

      // Stream the file to the AI service as multipart — no shared filesystem needed.
      const form = new FormData();
      form.append('file', new Blob([content], { type: mimeType }), filename);
      form.append('document_version_id', versionId);
      form.append('embed', 'true');

      const ingestResponse = await fetch(`${this.aiBaseUrl}/ingest-file`, {
        method: 'POST',
        body: form,
      });

      if (!ingestResponse.ok) {
        const errorText = await ingestResponse.text();
        throw new Error(`AI ingest failed (${ingestResponse.status}): ${errorText}`);
      }

      const result = await ingestResponse.json();
      this.logger.log(`Ingested ${filename}: ${JSON.stringify(result)}`);

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

      // Mark the exact failed job (if any) as FAILED
      try {
        if (activeJobId && activeDocId) {
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
        }
      } catch { /* ignore cleanup errors */ }
    } finally {
      this.processing = false;
    }
  }
}