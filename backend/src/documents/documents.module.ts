import { Module } from '@nestjs/common';
import { DatabaseDocumentStorage } from './database-document-storage.service';
import { DOCUMENT_STORAGE } from './document-storage.interface';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      provide: DOCUMENT_STORAGE,
      useClass: DatabaseDocumentStorage,
    },
  ],
  exports: [DocumentsService, DOCUMENT_STORAGE],
})
export class DocumentsModule {}

