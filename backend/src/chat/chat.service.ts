import { Injectable, NotFoundException } from '@nestjs/common';
import { LegalStatus, MessageRole } from '@prisma/client';
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
  /**
   * Potongan yang dipakai menyusun jawaban. Untuk pertanyaan balik ini satu-
   * satunya jejak bahannya, karena pertanyaan balik tidak punya sitasi.
   */
  retrieval?: { chunk_id: string }[];
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
  /**
   * Status keberlakuan dokumen sumbernya SAAT INI, bukan saat jawaban dibuat.
   *
   * Dibaca ulang dari database backend tiap kali sitasi dikirim — juga untuk
   * riwayat lama. Peraturan yang dicabut bulan depan membuat jawaban bulan lalu
   * ikut menyesatkan, jadi menyimpan statusnya sebagai potret akan salah persis
   * pada kasus yang paling perlu diperingatkan.
   */
  legalStatus: LegalStatus;
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
    chosenContextChunkIds?: string[],
  ) {
    // Dihitung sejak permintaan masuk, sama dengan titik mulai penghitung di
    // layar, supaya angka yang tersimpan tidak berbeda dari yang tadi terlihat.
    const startedAt = Date.now();
    const conversation = await this.resolveConversation(question, actor, conversationId);
    const isFollowUp = isFollowUpQuestion(question);
    // Pilihan dari pertanyaan balik membawa bahannya sendiri: potongan yang
    // dipakai menyusun pilihan itu. Tanpa ini pertanyaan yang baru saja
    // ditawarkan sistem harus mencari dari nol, dan bisa berakhir "tidak
    // ditemukan" — persis pertanyaan yang sistem sendiri bilang bisa dijawab.
    // Id-nya tetap disaring hak akses di AI service, jadi memercayainya sebatas
    // "pernah terlihat oleh pengguna ini" sudah cukup.
    const chosen = (chosenContextChunkIds ?? []).slice(0, 8);
    // These reads do not depend on each other. Run them together so the chat
    // request does not wait for three database round trips in sequence.
    const [previousChunkIds, conversationTopic, access] = await Promise.all([
      isFollowUp && !chosen.length ? this.getContextChunkIds(conversation.id) : Promise.resolve([]),
      isFollowUp ? this.getConversationTopic(conversation.id) : Promise.resolve(undefined),
      this.accessScope(actor),
    ]);
    const contextChunkIds = chosen.length ? chosen : previousChunkIds;

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
      const citations = await this.verifiedCitations(result.citations ?? [], actor);
      const durationMs = Date.now() - startedAt;
      await this.persistAssistantMessage(conversation.id, result.answer, citations, durationMs);

      return {
        conversationId: conversation.id,
        answer: result.answer,
        citations,
        durationMs,
        suggestions: result.suggestions ?? [],
        // Antarmuka mengunci kolom ketik selama ini bernilai true, supaya
        // pengguna menuntaskan dulu pertanyaan balik dari AI.
        awaitingChoice: result.awaiting_choice ?? false,
        // Hanya untuk pertanyaan balik: bahan yang melahirkan pilihannya,
        // dikembalikan supaya klik pada salah satu pilihan bisa membawanya.
        // Jawaban biasa tidak perlu — sitasinya sudah tersimpan di database.
        contextChunkIds: result.awaiting_choice
          ? (result.retrieval ?? []).map((item) => item.chunk_id).slice(0, 8)
          : [],
      };
    } catch (error) {
      const answer = 'Maaf, pertanyaan belum dapat diproses sekarang. Coba salah satu pertanyaan berikut tentang dokumen perusahaan:';
      const citations: ChatCitation[] = [];
      const durationMs = Date.now() - startedAt;
      await this.persistAssistantMessage(conversation.id, answer, citations, durationMs);
      return {
        conversationId: conversation.id,
        answer,
        citations,
        durationMs,
        suggestions: QUICK_SUGGESTIONS,
        // Kegagalan bukan pertanyaan balik: kolom ketik harus tetap terbuka.
        awaitingChoice: false,
        contextChunkIds: [],
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

  /**
   * Sitasi dari AI yang sudah dipastikan boleh dilihat aktor, beserta status
   * keberlakuan dokumennya.
   *
   * Statusnya dibaca dari database backend, bukan diambil dari balasan AI:
   * kolomnya milik Prisma, dan satu-satunya nilai yang benar adalah yang ada di
   * sini saat sitasinya dikirim. Sekalian: pemeriksaan akses memang sudah
   * menanyakan baris yang sama, jadi tidak ada query tambahan.
   */
  private async verifiedCitations(raw: AiCitation[], actor: AuthenticatedUser): Promise<ChatCitation[]> {
    const citations = this.toClientCitations(raw);
    if (!citations.length) return citations;
    const chunks = await this.prisma.documentChunk.findMany({
      where: { chunkId: { in: citations.map((item) => item.chunkId) }, documentVersion: { document: documentVisibilityWhere(actor) } },
      select: {
        chunkId: true,
        documentVersionId: true,
        documentVersion: { select: { documentId: true, document: { select: { legalStatus: true } } } },
      },
    });
    return citations.map((item) => {
      const chunk = chunks.find((row) => row.chunkId === item.chunkId
        && row.documentVersionId === item.documentVersionId
        && row.documentVersion.documentId === item.documentId);
      if (!chunk) throw new Error('AI citation is outside the permitted documents');
      return { ...item, legalStatus: chunk.documentVersion.document.legalStatus };
    });
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

  /**
   * Bentuk mentah dari AI service menjadi bentuk klien. `legalStatus` diisi
   * sementara dengan BERLAKU dan ditimpa verifiedCitations dari database —
   * tidak ada jalur lain yang mengirim sitasi ke klien tanpa melewati sana.
   */
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
      legalStatus: LegalStatus.BERLAKU,
    }));
  }

  private async persistAssistantMessage(
    conversationId: string,
    answer: string,
    citations: ChatCitation[],
    durationMs: number,
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
          durationMs,
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
