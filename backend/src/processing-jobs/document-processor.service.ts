import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DocumentStorage, DOCUMENT_STORAGE } from '../documents/document-storage.interface';
import { Inject } from '@nestjs/common';
import { aiServiceUrl, workerToken } from '../config/env.util';

const POLL_INTERVAL_MS = 3000;
const AI_INGEST_MAX_ATTEMPTS = 3;
const AI_INGEST_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function embeddingsEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.AI_EMBEDDINGS_ENABLED ?? '').trim().toLowerCase(),
  );
}

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
    let activeJobId: string | null = null;
    let activeDocId: string | null = null;

    try {
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

      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: { status: 'PROCESSING', startedAt: new Date(), attemptCount: { increment: 1 } },
      });
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'PROCESSING' },
      });

      const fileContent = await this.storage.read(versionId);
      const content = Buffer.from(fileContent);

      let ingestResponse: Response | null = null;
      for (let attempt = 1; attempt <= AI_INGEST_MAX_ATTEMPTS; attempt += 1) {
        const form = new FormData();
        form.append('file', new Blob([content], { type: mimeType }), filename);
        form.append('document_version_id', versionId);
        form.append('embed', embeddingsEnabled() ? 'true' : 'false');

        let response: Response;
        try {
          response = await fetch(`${this.aiBaseUrl}/ingest-file`, {
            method: 'POST',
            headers: { 'X-Worker-Token': workerToken() },
            body: form,
          });
        } catch (error) {
          if (attempt === AI_INGEST_MAX_ATTEMPTS) throw error;
          this.logger.warn(
            `AI ingest attempt ${attempt}/${AI_INGEST_MAX_ATTEMPTS} errored; retrying: ${
              error instanceof Error ? error.message : error
            }`,
          );
          await delay(attempt * 1000);
          continue;
        }

        if (response.ok) {
          ingestResponse = response;
          break;
        }

        const errorText = await response.text();
        const retryable = AI_INGEST_RETRYABLE_STATUSES.has(response.status);
        if (!retryable || attempt === AI_INGEST_MAX_ATTEMPTS) {
          throw new Error(`AI ingest failed (${response.status}): ${errorText}`);
        }

        this.logger.warn(
          `AI ingest attempt ${attempt}/${AI_INGEST_MAX_ATTEMPTS} failed (${response.status}); retrying`,
        );
        await delay(attempt * 1000);
      }

      if (!ingestResponse) {
        throw new Error('AI ingest failed without a response');
      }

      const result = await ingestResponse.json();
      this.logger.log(`Ingested ${filename}: ${JSON.stringify(result)}`);

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
      } catch { }
    } finally {
      this.processing = false;
    }
  }
}
