import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { aiServiceHeaders, aiServiceUrl } from '../config/env.util';
import { allowedCategoryFilter, documentVisibilityWhere } from '../documents/document-visibility';

interface AiCitation {
  document_id: string;
  filename: string;
  title?: string;
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

// Pertanyaan definisional seperti "apa itu retribusi daerah" membuka topik
// baru, walaupun mengandung kata rujukan "itu".
const DEFINITIONAL_OPENER = /^(apa|apakah|siapa)\s+itu\b|^apa\s+yang\s+dimaksud\b/;

// Penanda kalimat yang sengaja menggantung pada jawaban sebelumnya.
const FOLLOW_UP_OPENER = /^(berarti|jadi|kalau\s+(begitu|gitu|iya|tidak|ya)|lalu|terus|trus|selain\s+itu|apalagi|apa\s+lagi|bagaimana\s+dengan|gimana\s+dengan|sedangkan|kalau\s+untuk)\b/;
const REFERENCE_WORD = /\b(itu|tersebut|tadi|sebelumnya|barusan|di\s+atas)\b/;
const ELLIPSIS_WORD = /^(apa|apakah|kenapa|mengapa|berapa|kapan|siapa|bagaimana|gimana|dimana|mana|saja|aja|juga|lagi|ya|dong|sih|kah|dan|atau|yang|begitu|gitu|demikian|lalu|terus)$|nya$/;

/**
 * Konteks room hanya dipakai ketika pertanyaan memang bergantung pada
 * giliran sebelumnya. Topik baru harus memulai retrieval dari pertanyaannya
 * sendiri agar konteks lama tidak menutupi dokumen yang relevan.
 */
export function isFollowUpQuestion(question: string): boolean {
  const text = question.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text || DEFINITIONAL_OPENER.test(text)) return false;
  if (FOLLOW_UP_OPENER.test(text) || REFERENCE_WORD.test(text)) return true;

  const words = text.replace(/[?!.,]+$/g, '').split(' ');
  return words.length <= 4 && words.every((word) => ELLIPSIS_WORD.test(word));
}

export interface ChatCitation {
  documentId: string;
  documentVersionId: string;
  filename: string;
  /** Nama yang dilihat pengguna di daftar dokumen; berbeda dari `filename`
   *  begitu dokumennya diganti nama. */
  title?: string;
  version?: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkId: string;
  excerpt?: string;
}

const QUICK_SUGGESTIONS = [
  'Ringkas dokumen yang tersedia.',
  'Apa poin penting dari dokumen saya?',
  'Jelaskan informasi utama beserta sumbernya.',
  'Apakah ada informasi yang berbeda antar dokumen?',
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
    const isFollowUp = isFollowUpQuestion(question);
    const contextChunkIds = isFollowUp ? await this.getContextChunkIds(conversation.id) : [];
    const conversationTopic = isFollowUp
      ? await this.getConversationTopic(conversation.id)
      : undefined;
    const access = await this.accessScope(actor);

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
          workspace_type: actor.accountType,
          conversation_topic: conversationTopic,
          top_k: 5,
          use_llm: Boolean(process.env.AI_PROVIDER_API_KEY),
          // Hanya pertanyaan yang diketik sendiri yang boleh dibalas dengan
          // pertanyaan balik saat maksudnya terlalu luas.
          allow_clarify: !fromSuggestion,
          // Batas akses penanya. AI service menolak permintaan tanpa ini.
          access,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }

      const result = (await response.json()) as AiAskResult;
      const citations = this.toClientCitations(result.citations ?? []);
      await this.assertCitationsAccessible(citations, actor);
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
      const answer = 'Maaf, pertanyaan belum dapat diproses sekarang. Coba salah satu pertanyaan berikut tentang dokumen perusahaan:';
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

  /**
   * Terjemahkan aktor menjadi batas akses yang dikirim ke AI service.
   *
   * Aturan siapa-boleh-apa sengaja tetap di backend — AI service hanya
   * menerima hasilnya dan menjalankan penyaring. Dengan begitu hanya ada satu
   * tempat yang perlu diubah kalau kebijakan aksesnya berubah.
   *
   * Unit kerja aktor ikut dikirim, bukan hanya daftar kategori: penanda unit
   * pada dokumen adalah cara utama mengunci dokumen, dan kunci yang tidak
   * ditegakkan di jalur tanya-jawab sama saja dengan tidak ada — isinya tetap
   * bisa dikutip AI untuk unit lain meski dokumennya tak muncul di daftar.
   */
  private async accessScope(actor: AuthenticatedUser) {
    const boundary = { workspace_id: actor.workspaceId, uploaded_by_id: actor.accountType === 'PERSONAL' ? actor.sub : null };
    const filter = allowedCategoryFilter(actor);
    if (actor.isAdmin || actor.accountType === 'PERSONAL') {
      return { ...boundary, is_admin: actor.isAdmin, allowed_category_ids: [] as string[], unit_kerja_id: null };
    }
    const categories = await this.prisma.documentCategory.findMany({
      where: filter ?? { workspaceId: actor.workspaceId },
      select: { id: true },
    });
    return {
      ...boundary,
      is_admin: false,
      allowed_category_ids: categories.map((category) => category.id),
      unit_kerja_id: actor.unitKerjaId ?? null,
    };
  }

  private async assertCitationsAccessible(citations: ChatCitation[], actor: AuthenticatedUser) {
    if (!citations.length) return;
    const chunks = await this.prisma.documentChunk.findMany({
      where: { chunkId: { in: citations.map((item) => item.chunkId) }, documentVersion: { document: documentVisibilityWhere(actor) } },
      select: { chunkId: true, documentVersionId: true, documentVersion: { select: { documentId: true } } },
    });
    if (citations.some((item) => !chunks.some((chunk) => chunk.chunkId === item.chunkId && chunk.documentVersionId === item.documentVersionId && chunk.documentVersion.documentId === item.documentId))) {
      throw new Error('AI citation is outside the permitted documents');
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
    if (messages.length === 0) return undefined;
    // Topik berasal dari pertanyaan user sendiri agar follow-up bekerja untuk
    // bidang apa pun, bukan hanya daftar topik perusahaan yang di-hardcode.
    return messages
      .reverse()
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join(' | ')
      .slice(0, 400);
  }

  private toClientCitations(citations: AiCitation[]): ChatCitation[] {
    return citations.map((citation) => ({
      documentId: citation.document_id,
      documentVersionId: citation.document_version_id ?? '',
      filename: citation.filename,
      title: citation.title,
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
