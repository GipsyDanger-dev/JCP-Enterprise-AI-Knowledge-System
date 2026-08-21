import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { WorkerTokenGuard } from './guards/worker-token.guard';
import { ProcessingJobsController } from './processing-jobs.controller';
import { ProcessingJobsService } from './processing-jobs.service';

@Module({
  imports: [DocumentsModule],
  controllers: [ProcessingJobsController],
  providers: [ProcessingJobsService, WorkerTokenGuard],
  exports: [ProcessingJobsService],
})
export class ProcessingJobsModule {}
