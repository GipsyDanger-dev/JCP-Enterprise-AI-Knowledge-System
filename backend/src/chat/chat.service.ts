import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

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

export interface ChatCitation {
  documentId: string;
  documentVersionId: string;
  filename: string;
  version?: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkId: string;
}

@Injectable()
export class ChatService {
  private readonly aiBaseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';

  constructor(private readonly prisma: PrismaService) {}

  async query(
    question: string,
    actor: AuthenticatedUser,
    conversationId?: string,
  ) {
    const conversation = await this.resolveConversation(question, actor, conversationId);

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: question,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    try {
      const response = await fetch(`${this.aiBaseUrl}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: question,
          top_k: 5,
          use_llm: Boolean(process.env.SUMOPOD_API_KEY || process.env.LLM_API_KEY),
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }

      const result = (await response.json()) as AiAskResult;
      const citations = this.toClientCitations(result.citations ?? []);
      await this.persistAssistantMessage(conversation.id, result.answer, citations);

      return {
        conversationId: conversation.id,
        answer: result.answer,
        citations,
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        `AI service tidak tersedia: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async resolveConversation(
    question: string,
    actor: AuthenticatedUser,
    conversationId?: string,
  ) {
    if (!conversationId) {
      return this.prisma.conversation.create({
        data: { userId: actor.sub, title: question.slice(0, 120) },
        select: { id: true },
      });
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId: actor.sub },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private toClientCitations(citations: AiCitation[]): ChatCitation[] {
    return citations.map((citation) => ({
      documentId: citation.document_id,
      documentVersionId: citation.document_version_id ?? '',
      filename: citation.filename,
      version: typeof citation.version === 'number' ? citation.version : undefined,
      pageNumber: citation.page_number ?? null,
      sectionTitle: citation.section_title ?? null,
      chunkId: citation.chunk_id,
    }));
  }

  private async persistAssistantMessage(
    conversationId: string,
    answer: string,
    citations: ChatCitation[],
  ) {
    const citationCandidates = citations.filter(
      (citation) => this.isUuid(citation.documentVersionId) && citation.chunkId,
    );
    const versions = citationCandidates.length === 0
      ? []
      : await this.prisma.documentVersion.findMany({
          where: { id: { in: citationCandidates.map((citation) => citation.documentVersionId) } },
          select: { id: true },
        });
    const validVersionIds = new Set(versions.map((version) => version.id));
    const uniqueChunks = new Set<string>();
    const persistentCitations = citationCandidates.filter((citation) => {
      if (!validVersionIds.has(citation.documentVersionId) || uniqueChunks.has(citation.chunkId)) return false;
      uniqueChunks.add(citation.chunkId);
      return true;
    });

    await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: answer,
          citations: {
            create: persistentCitations.map((citation, sortOrder) => ({
              documentVersionId: citation.documentVersionId,
              chunkId: citation.chunkId,
              pageNumber: citation.pageNumber,
              sectionTitle: citation.sectionTitle,
              sortOrder,
            })),
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
