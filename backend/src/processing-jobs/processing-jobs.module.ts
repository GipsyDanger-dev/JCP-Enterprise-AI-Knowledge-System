import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { WorkerTokenGuard } from './guards/worker-token.guard';
import { ProcessingJobsController } from './processing-jobs.controller';
import { ProcessingJobsService } from './processing-jobs.service';
import { DocumentProcessorService } from './document-processor.service';

@Module({
  imports: [DocumentsModule],
  controllers: [ProcessingJobsController],
  providers: [ProcessingJobsService, WorkerTokenGuard, DocumentProcessorService],
  exports: [ProcessingJobsService, DocumentProcessorService],
})
export class ProcessingJobsModule {}
