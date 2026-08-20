import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

@Injectable()
export class ChatService {
  private nextConversationId = 1;

  constructor(private readonly aiService: AiService) {}

  async query(question: string) {
    const result = await this.aiService.ask(question);
    return {
      conversationId: String(this.nextConversationId++),
      answer: result.grounded ? result.answer : null,
      ...(result.grounded ? {} : {
        message: result.answer || 'Informasi tidak ditemukan pada dokumen yang tersedia.',
      }),
      citations: result.citations.map((citation) => ({
        documentId: citation.document_id,
        documentVersionId: `${citation.document_id}:${citation.version ?? 'unknown'}`,
        filename: citation.filename,
        version: typeof citation.version === 'number' ? citation.version : undefined,
        pageNumber: citation.page_number ?? null,
        sectionTitle: citation.section_title ?? null,
        chunkId: citation.chunk_id,
      })),
    };
  }
}
