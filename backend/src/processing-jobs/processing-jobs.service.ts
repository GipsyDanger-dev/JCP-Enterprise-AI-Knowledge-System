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
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../database/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage } from '../documents/document-storage.interface';
import {
  CompleteProcessingJobDto,
  ProcessingJobResultStatus,
} from './dto/complete-processing-job.dto';

const MAX_CLAIM_ATTEMPTS = 10;

@Injectable()
export class ProcessingJobsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async claim() {
    for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
      const claimedJob = await this.tryClaim();
      if (claimedJob) return claimedJob;
      if (claimedJob === undefined) break;
    }

    throw new NotFoundException('No queued processing job is available');
  }

  async getFile(id: string) {
    const job = await this.prisma.processingJob.findUnique({
      where: { id },
      select: {
        status: true,
        documentVersion: {
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            fileSize: true,
            checksum: true,
            document: { select: { deletedAt: true } },
          },
        },
      },
    });
    if (!job || job.documentVersion.document.deletedAt) {
      throw new NotFoundException('Processing job or document not found');
    }
    if (job.status !== ProcessingJobStatus.PROCESSING) {
      throw new ConflictException('Only a PROCESSING job can access its document file');
    }

    const content = await this.storage.read(job.documentVersion.id);
    return {
      content: Buffer.from(content),
      originalFilename: job.documentVersion.originalFilename,
      mimeType: job.documentVersion.mimeType,
      fileSize: job.documentVersion.fileSize,
      checksum: job.documentVersion.checksum,
    };
  }

  async complete(id: string, input: CompleteProcessingJobDto) {
    const errorMessage = input.errorMessage?.trim();
    if (input.status === ProcessingJobResultStatus.FAILED && !errorMessage) {
      throw new BadRequestException('errorMessage is required when status is FAILED');
    }

    const targetJobStatus =
      input.status === ProcessingJobResultStatus.COMPLETED
        ? ProcessingJobStatus.COMPLETED
        : ProcessingJobStatus.FAILED;
    const targetDocumentStatus =
      targetJobStatus === ProcessingJobStatus.COMPLETED
        ? DocumentStatus.READY
        : DocumentStatus.FAILED;

    return this.prisma.$transaction(async (transaction) => {
      const job = await transaction.processingJob.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          completedAt: true,
          errorMessage: true,
          documentVersion: {
            select: {
              document: {
                select: { id: true, status: true, deletedAt: true },
              },
            },
          },
        },
      });
      if (!job) throw new NotFoundException('Processing job not found');

      const document = job.documentVersion.document;
      if (document.deletedAt || document.status === DocumentStatus.DELETED) {
        throw new ConflictException('Cannot finish a job for a deleted document');
      }

      if (job.status === targetJobStatus) {
        return {
          id: job.id,
          status: job.status,
          errorMessage: job.errorMessage,
          completedAt: job.completedAt,
          document: { id: document.id, status: document.status },
        };
      }
      if (job.status !== ProcessingJobStatus.PROCESSING) {
        throw new ConflictException(`Cannot change a ${job.status} job to ${targetJobStatus}`);
      }

      const completedAt = new Date();
      const updatedJob = await transaction.processingJob.updateMany({
        where: { id, status: ProcessingJobStatus.PROCESSING },
        data: {
          status: targetJobStatus,
          errorMessage: targetJobStatus === ProcessingJobStatus.FAILED ? errorMessage : null,
          completedAt,
        },
      });
      if (updatedJob.count === 0) {
        throw new ConflictException('The job was finished by another worker');
      }

      const updatedDocument = await transaction.document.updateMany({
        where: {
          id: document.id,
          deletedAt: null,
          status: DocumentStatus.PROCESSING,
        },
        data: { status: targetDocumentStatus },
      });
      if (updatedDocument.count === 0) {
        throw new ConflictException('The document changed while its job was being finished');
      }

      await this.auditLogs.record(transaction, {
        actorType: AuditActorType.WORKER,
        action:
          targetJobStatus === ProcessingJobStatus.COMPLETED
            ? AuditAction.PROCESSING_JOB_COMPLETED
            : AuditAction.PROCESSING_JOB_FAILED,
        targetType: 'PROCESSING_JOB',
        targetId: id,
        metadata: {
          documentId: document.id,
          documentStatus: targetDocumentStatus,
        },
      });

      return {
        id,
        status: targetJobStatus,
        errorMessage: targetJobStatus === ProcessingJobStatus.FAILED ? errorMessage : null,
        completedAt,
        document: { id: document.id, status: targetDocumentStatus },
      };
    });
  }

  private async tryClaim() {
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.processingJob.findFirst({
        where: {
          status: ProcessingJobStatus.QUEUED,
          documentVersion: { document: { deletedAt: null } },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          idempotencyKey: true,
          attemptCount: true,
          createdAt: true,
          documentVersion: {
            select: {
              id: true,
              versionNumber: true,
              originalFilename: true,
              mimeType: true,
              fileSize: true,
              checksum: true,
              document: { select: { id: true, title: true } },
            },
          },
        },
      });
      if (!candidate) return undefined;

      const startedAt = new Date();
      const claimed = await transaction.processingJob.updateMany({
        where: { id: candidate.id, status: ProcessingJobStatus.QUEUED },
        data: {
          status: ProcessingJobStatus.PROCESSING,
          attemptCount: { increment: 1 },
          errorMessage: null,
          startedAt,
          completedAt: null,
        },
      });
      if (claimed.count === 0) return null;

      const documentUpdated = await transaction.document.updateMany({
        where: { id: candidate.documentVersion.document.id, deletedAt: null },
        data: { status: DocumentStatus.PROCESSING },
      });
      if (documentUpdated.count === 0) {
        throw new ConflictException('Document was deleted while its job was being claimed');
      }

      await this.auditLogs.record(transaction, {
        actorType: AuditActorType.WORKER,
        action: AuditAction.PROCESSING_JOB_CLAIMED,
        targetType: 'PROCESSING_JOB',
        targetId: candidate.id,
        metadata: {
          documentId: candidate.documentVersion.document.id,
          documentVersionId: candidate.documentVersion.id,
          attemptCount: candidate.attemptCount + 1,
        },
      });

      return {
        id: candidate.id,
        idempotencyKey: candidate.idempotencyKey,
        status: ProcessingJobStatus.PROCESSING,
        attemptCount: candidate.attemptCount + 1,
        startedAt,
        createdAt: candidate.createdAt,
        document: candidate.documentVersion.document,
        version: {
          id: candidate.documentVersion.id,
          versionNumber: candidate.documentVersion.versionNumber,
          originalFilename: candidate.documentVersion.originalFilename,
          mimeType: candidate.documentVersion.mimeType,
          fileSize: candidate.documentVersion.fileSize,
          checksum: candidate.documentVersion.checksum,
        },
      };
    });
  }
}
