import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface AiCitation {
  document_id: string;
  filename: string;
  version?: number | string;
  page_number?: number | null;
  section_title?: string | null;
  chunk_id: string;
}

interface AiAskResult {
  answer: string;
  citations: AiCitation[];
  grounded: boolean;
}

@Injectable()
export class AiService {
  private readonly baseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';

  async ask(query: string): Promise<AiAskResult> {
    try {
      const response = await fetch(`${this.baseUrl}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The AI service owns the provider key. These flags only choose the
        // grounded response path and retrieval strategy.
        body: JSON.stringify({
          query,
          top_k: 5,
          use_llm: process.env.AI_USE_LLM === 'true',
          retriever: process.env.AI_RETRIEVER ?? 'tfidf',
        }),
      });
      if (!response.ok) throw new Error(`AI service returned ${response.status}`);
      return (await response.json()) as AiAskResult;
    } catch (error) {
      throw new ServiceUnavailableException(
        `AI service tidak tersedia: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
