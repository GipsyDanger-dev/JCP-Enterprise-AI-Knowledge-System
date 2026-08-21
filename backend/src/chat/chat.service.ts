import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface AiCitation {
  document_id: string;
  filename: string;
  version?: number | string;
  page_number?: number | null;
  section_title?: string | null;
  chunk_id: string;
  document_version_id?: string;
}

interface AiAskResult {
  answer: string;
  citations: AiCitation[];
  grounded: boolean;
}

@Injectable()
export class ChatService {
  private readonly aiBaseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';

  async query(question: string) {
    try {
      const response = await fetch(`${this.aiBaseUrl}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: question,
          top_k: 5,
          use_llm: Boolean(process.env.SUMOPOD_API_KEY),
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }

      const result = (await response.json()) as AiAskResult;

      // If grounded, return answer with citations
      // If not grounded but has an answer (general chat), return it
      // If not grounded and no answer, return no-answer message
      return {
        answer: result.answer,
        citations: result.citations.map((citation) => ({
          documentId: citation.document_id,
          documentVersionId: citation.document_version_id ?? `${citation.document_id}:${citation.version ?? 'unknown'}`,
          filename: citation.filename,
          version: typeof citation.version === 'number' ? citation.version : undefined,
          pageNumber: citation.page_number ?? null,
          sectionTitle: citation.section_title ?? null,
          chunkId: citation.chunk_id,
        })),
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        `AI service tidak tersedia: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
