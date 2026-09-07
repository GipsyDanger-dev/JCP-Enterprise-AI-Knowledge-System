import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { aiServiceHeaders, aiServiceUrl } from '../config/env.util';
import { allowedCategoryFilter, documentVisibilityWhere } from '../documents/document-visibility';

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

/**
 * Bersihkan judul/nama berkas menjadi label yang enak dibaca di tombol saran.
 *
 * Nama berkas arsip hukum jarang berupa kalimat ("PerbupNomor11Tahun2026ttg
 * PengelolaanSampah.pdf"), jadi batas kata disisipkan dulu.
 */
function readableTitle(raw: string): string {
  const withoutExtension = raw.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const spaced = withoutExtension
    .replace(/[_\-.]+/g, ' ')
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')
    .replace(/(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])/g, ' ')
    .replace(/\bttg\b/gi, 'tentang')
    .replace(/\s+/g, ' ')
    .trim();
  if (spaced.length <= 64) return spaced;
  return spaced.slice(0, 64).replace(/\s\S*$/, '').trim();
}

/**
 * Apakah pertanyaan ini perlu ditempeli topik percakapan sebelumnya.
 *
 * Pertanyaan panjang sudah membawa subjeknya sendiri; menempeli judul dokumen
 * yang barusan dikutip malah menarik pencarian kembali ke dokumen itu saat
 * pengguna sebenarnya sudah berpindah bahasan. Yang butuh sandaran hanyalah
 * susulan pendek seperti "berarti tidak boleh ya?".
 */
function needsConversationTopic(question: string): boolean {
  return question.trim().split(/\s+/).length <= 8;
}

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
    const conversationTopic = needsConversationTopic(question)
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
          conversation_topic: conversationTopic,
          top_k: 5,
          use_llm: Boolean(process.env.SUMOPOD_API_KEY || process.env.LLM_API_KEY),
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
      const suggestions = await this.fallbackSuggestions(actor);
      const answer = suggestions.length > 0
        ? 'Maaf, pertanyaan belum dapat diproses sekarang. Coba salah satu pertanyaan berikut:'
        : 'Maaf, pertanyaan belum dapat diproses sekarang. Silakan coba lagi sebentar lagi.';
      const citations: ChatCitation[] = [];
      await this.persistAssistantMessage(conversation.id, answer, citations);
      return {
        conversationId: conversation.id,
        answer,
        citations,
        suggestions,
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
    const filter = allowedCategoryFilter(actor);
    if (filter === null) {
      return { is_admin: true, allowed_category_ids: [] as string[], unit_kerja_id: null };
    }
    const categories = await this.prisma.documentCategory.findMany({
      where: filter,
      select: { id: true },
    });
    return {
      is_admin: false,
      allowed_category_ids: categories.map((category) => category.id),
      unit_kerja_id: actor.unitKerjaId ?? null,
    };
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

  /**
   * Label topik untuk pertanyaan lanjutan ("berarti tidak boleh ya?").
   *
   * Diambil dari sumber jawaban terakhir — judul dokumen dan bagian yang
   * benar-benar dikutip — bukan dari daftar tema yang ditulis di kode. Daftar
   * seperti itu hanya mengenali topik yang kebetulan terpikirkan saat ditulis,
   * lalu diam untuk seluruh isi arsip yang lain; percakapan tentang dokumen di
   * luar daftar kehilangan konteksnya tanpa ada yang menyadari.
   */
  private async getConversationTopic(conversationId: string): Promise<string | undefined> {
    const latestAnswer = await this.prisma.message.findFirst({
      where: { conversationId, role: MessageRole.ASSISTANT, citations: { some: {} } },
      orderBy: { createdAt: 'desc' },
      select: {
        citations: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: {
            sectionTitle: true,
            documentVersion: {
              select: { originalFilename: true, document: { select: { title: true } } },
            },
          },
        },
      },
    });
    const citation = latestAnswer?.citations[0];
    if (!citation) return undefined;

    const documentLabel = readableTitle(
      citation.documentVersion.document.title || citation.documentVersion.originalFilename,
    );
    const section = (citation.sectionTitle ?? '').trim();
    const parts = [documentLabel, section].filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(' — ') : undefined;
  }

  /**
   * Saran cadangan saat AI service tidak bisa dihubungi: diambil dari dokumen
   * yang memang boleh dibaca aktor, lewat penyaring akses yang sama dengan
   * daftar dokumen. Kalau tidak ada satu pun, lebih baik tanpa saran daripada
   * menawarkan topik yang tidak ada isinya.
   */
  private async fallbackSuggestions(actor: AuthenticatedUser): Promise<string[]> {
    try {
      const documents = await this.prisma.document.findMany({
        where: documentVisibilityWhere(actor),
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: { title: true },
      });
      return documents
        .map((document) => readableTitle(document.title))
        .filter((title) => title.length > 0)
        .map((title, index) => (index % 2 === 0
          ? `Apa poin utama dokumen ${title}?`
          : `Ringkas isi ${title}`));
    } catch {
      return [];
    }
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
