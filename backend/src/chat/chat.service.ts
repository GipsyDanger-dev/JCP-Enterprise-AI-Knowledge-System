import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, MessageRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { aiServiceHeaders, aiServiceUrl } from '../config/env.util';

interface AiCitation {
  document_id: string;
  filename: string;
  version?: number | string;
  page_number?: number | null;
  section_title?: string | null;
  chunk_id: string;
  document_version_id?: string;
  excerpt?: string;
}

interface AiAskResult {
  answer: string;
  citations: AiCitation[];
  grounded: boolean;
  suggestions?: string[];
  awaiting_choice?: boolean;
}

export interface ChatCitation {
  documentId: string;
  documentVersionId: string;
  filename: string;
  version?: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkId: string;
  excerpt?: string;
}

const QUICK_SUGGESTIONS = [
  'Apa persyaratan cuti tahunan?',
  'Berapa batas pengajuan cuti sebelum tanggal cuti?',
  'Dokumen apa yang diperlukan untuk cuti sakit?',
  'Bagaimana alur persetujuan cuti?',
];

@Injectable()
export class ChatService {
  private readonly aiBaseUrl = aiServiceUrl();

  constructor(private readonly prisma: PrismaService) {}

  async query(
    question: string,
    actor: AuthenticatedUser,
    conversationId?: string,
    fromSuggestion?: boolean,
  ) {
    const conversation = await this.resolveConversation(question, actor, conversationId);
    const contextChunkIds = await this.getContextChunkIds(conversation.id);
    const conversationTopic = await this.getConversationTopic(conversation.id);
    const retrievalFilters = actor.accountType === AccountType.PERSONAL
      ? { uploaded_by_id: actor.sub }
      : !actor.isAdmin
        ? { collection: actor.role }
        : undefined;

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
        headers: aiServiceHeaders(),
        body: JSON.stringify({
          query: question,
          // Only opaque chunk ids cross to the AI service. Previous user/assistant text stays in the database.
          context_chunk_ids: contextChunkIds,
          filters: retrievalFilters,
          conversation_topic: conversationTopic,
          top_k: 5,
          use_llm: Boolean(process.env.AI_PROVIDER_API_KEY),
          // Hanya pertanyaan yang diketik sendiri yang boleh dibalas dengan
          // pertanyaan balik saat maksudnya terlalu luas.
          allow_clarify: !fromSuggestion,
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
        suggestions: result.suggestions ?? [],
        // Antarmuka mengunci kolom ketik selama ini bernilai true, supaya
        // pengguna menuntaskan dulu pertanyaan balik dari AI.
        awaitingChoice: result.awaiting_choice ?? false,
      };
    } catch (error) {
      const answer = actor.accountType === AccountType.PERSONAL
        ? 'Maaf, pertanyaan belum dapat diproses sekarang. Coba tanyakan kembali tentang dokumen di workspace Personal Anda.'
        : 'Maaf, pertanyaan belum dapat diproses sekarang. Coba salah satu pertanyaan berikut tentang dokumen perusahaan:';
      const citations: ChatCitation[] = [];
      await this.persistAssistantMessage(conversation.id, answer, citations);
      return {
        conversationId: conversation.id,
        answer,
        citations,
        suggestions: QUICK_SUGGESTIONS,
        // Kegagalan bukan pertanyaan balik: kolom ketik harus tetap terbuka.
        awaitingChoice: false,
      };
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

  private async getContextChunkIds(conversationId: string): Promise<string[]> {
    const latestAnswer = await this.prisma.message.findFirst({
      where: {
        conversationId,
        role: MessageRole.ASSISTANT,
        citations: { some: {} },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        citations: {
          select: { chunkId: true },
          orderBy: { sortOrder: 'asc' },
          take: 8,
        },
      },
    });
    return latestAnswer?.citations.map((citation) => citation.chunkId) ?? [];
  }

  private async getConversationTopic(conversationId: string): Promise<string | undefined> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId, role: MessageRole.USER },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { content: true },
    });
    const text = messages.map((message) => message.content.toLowerCase()).join(' ');
    if (/\b(cuti|izin)\b/.test(text)) return 'kebijakan cuti dan izin karyawan';
    if (/\b(reimbursement|penggantian biaya|klaim)\b/.test(text)) return 'kebijakan reimbursement dan penggantian biaya';
    if (/\b(perjalanan dinas|hotel|akomodasi)\b/.test(text)) return 'kebijakan perjalanan dinas';
    if (/\b(keamanan|security|akses)\b/.test(text)) return 'prosedur keamanan dan akses informasi';
    return undefined;
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
      excerpt: citation.excerpt,
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
              excerpt: citation.excerpt,
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
