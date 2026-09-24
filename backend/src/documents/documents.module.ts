import { Module } from '@nestjs/common';
import { DatabaseDocumentStorage } from './database-document-storage.service';
import { DocumentQueueSignal } from './document-queue.signal';
import { DOCUMENT_STORAGE } from './document-storage.interface';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentQueueSignal,
    {
      provide: DOCUMENT_STORAGE,
      useClass: DatabaseDocumentStorage,
    },
  ],
  exports: [DocumentsService, DocumentQueueSignal, DOCUMENT_STORAGE],
})
export class DocumentsModule {}

