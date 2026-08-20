import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AiCitation {
  documentId: string;
  documentVersionId: string;
  filename: string;
  version?: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkId: string;
}

export interface AiAskResult {
  answer: string;
  citations: AiCitation[];
  grounded: boolean;
  excerptsByChunkId: Map<string, string>;
}

@Injectable()
export class AiService {
  async ask(question: string): Promise<AiAskResult> {
    const baseUrl = process.env.AI_SERVICE_URL?.trim();
    if (!baseUrl) {
      throw new ServiceUnavailableException('AI service is not configured');
    }

    const endpoint = this.askEndpoint(baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, use_llm: true }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('AI service request timed out');
      }
      throw new BadGatewayException('AI service is unavailable');
    }

    if (!response.ok) {
      clearTimeout(timeout);
      throw new BadGatewayException(
        `AI service returned HTTP ${response.status}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('AI service request timed out');
      }
      throw new BadGatewayException('AI service returned invalid JSON');
    } finally {
      clearTimeout(timeout);
    }

    return this.parseAskResponse(payload);
  }

  private askEndpoint(baseUrl: string): string {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new ServiceUnavailableException('AI service URL is invalid');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ServiceUnavailableException('AI service URL is invalid');
    }
    return `${baseUrl.replace(/\/+$/, '')}/ask`;
  }

  private timeoutMs(): number {
    const configured = Number(process.env.AI_SERVICE_TIMEOUT_MS);
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_TIMEOUT_MS;
  }

  private parseAskResponse(payload: unknown): AiAskResult {
    if (!this.isRecord(payload)) {
      throw new BadGatewayException('AI service returned an invalid response');
    }
    const { answer, grounded, citations, retrieval } = payload;
    if (
      typeof answer !== 'string' ||
      answer.trim().length === 0 ||
      typeof grounded !== 'boolean' ||
      !Array.isArray(citations) ||
      !Array.isArray(retrieval)
    ) {
      throw new BadGatewayException('AI service returned an invalid response');
    }

    const mappedCitations = citations.map((citation) =>
      this.parseCitation(citation),
    );
    if ((!grounded && mappedCitations.length > 0) || (grounded && mappedCitations.length === 0)) {
      throw new BadGatewayException('AI service returned inconsistent grounding data');
    }

    const excerptsByChunkId = new Map<string, string>();
    for (const item of retrieval) {
      if (!this.isRecord(item) || typeof item.chunk_id !== 'string') {
        throw new BadGatewayException('AI service returned invalid retrieval data');
      }
      const excerpt = typeof item.text === 'string'
        ? item.text
        : typeof item.excerpt === 'string'
          ? item.excerpt
          : undefined;
      if (excerpt) excerptsByChunkId.set(item.chunk_id, excerpt);
    }

    const uniqueChunkIds = new Set(mappedCitations.map(({ chunkId }) => chunkId));
    if (uniqueChunkIds.size !== mappedCitations.length) {
      throw new BadGatewayException('AI service returned duplicate citations');
    }

    return {
      answer,
      grounded,
      citations: grounded ? mappedCitations : [],
      excerptsByChunkId,
    };
  }

  private parseCitation(value: unknown): AiCitation {
    if (!this.isRecord(value)) {
      throw new BadGatewayException('AI service returned an invalid citation');
    }
    const documentId = value.document_id;
    const documentVersionId = value.document_version_id;
    const filename = value.filename;
    const chunkId = value.chunk_id;
    const pageNumber = value.page_number;
    const sectionTitle = value.section_title;
    const version = value.version;

    if (
      typeof documentId !== 'string' ||
      !isUUID(documentId) ||
      typeof documentVersionId !== 'string' ||
      !isUUID(documentVersionId) ||
      typeof filename !== 'string' ||
      filename.trim().length === 0 ||
      typeof chunkId !== 'string' ||
      chunkId.length === 0 ||
      (pageNumber !== null && (!Number.isInteger(pageNumber) || Number(pageNumber) < 1)) ||
      (sectionTitle !== null && typeof sectionTitle !== 'string') ||
      (version !== undefined && (!Number.isInteger(version) || Number(version) < 1))
    ) {
      throw new BadGatewayException('AI service returned an invalid citation');
    }

    return {
      documentId,
      documentVersionId,
      filename,
      version: typeof version === 'number' ? version : undefined,
      pageNumber: typeof pageNumber === 'number' ? pageNumber : null,
      sectionTitle: typeof sectionTitle === 'string' ? sectionTitle : null,
      chunkId,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
