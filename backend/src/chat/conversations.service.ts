import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { ChatQueryDto } from './dto/chat-query.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateUserMessageDto } from './dto/create-user-message.dto';

const MESSAGE_PREVIEW_LENGTH = 160;
const AUTOMATIC_TITLE_LENGTH = 100;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  create(input: CreateConversationDto, actor: AuthenticatedUser) {
    return this.prisma.conversation.create({
      data: {
        userId: actor.sub,
        title: input.title ?? null,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll(actor: AuthenticatedUser) {
    const conversations = await this.prisma.conversation.findMany({
      where: { userId: actor.sub },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    return conversations.map(({ _count, messages, ...conversation }) => {
      const latestMessage = messages[0];
      return {
        ...conversation,
        title: conversation.title ?? '',
        messageCount: _count.messages,
        latestMessage: latestMessage
          ? {
              ...latestMessage,
              content: this.preview(latestMessage.content),
            }
          : null,
      };
    });
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId: actor.sub },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            citations: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                chunkId: true,
                pageNumber: true,
                sectionTitle: true,
                excerpt: true,
                sortOrder: true,
                documentVersion: {
                  select: {
                    id: true,
                    versionNumber: true,
                    originalFilename: true,
                    document: { select: { id: true, title: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return {
      ...conversation,
      title: conversation.title ?? '',
      messages: conversation.messages.map((message) => ({
        ...message,
        role: message.role.toLowerCase(),
        citations: message.citations.map(({ documentVersion, ...citation }) => ({
          ...citation,
          documentId: documentVersion.document.id,
          documentVersionId: documentVersion.id,
          filename: documentVersion.originalFilename,
          version: documentVersion.versionNumber,
        })),
      })),
    };
  }

  async query(input: ChatQueryDto, actor: AuthenticatedUser) {
    if (input.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: input.conversationId, userId: actor.sub },
        select: { id: true },
      });
      if (!conversation) throw new NotFoundException('Conversation not found');
    }

    const aiResult = await this.ai.ask(input.question);
    const assistantContent = aiResult.answer;

    const persisted = await this.prisma.$transaction(async (transaction) => {
      const ownedConversation = input.conversationId
        ? await transaction.conversation.findFirst({
            where: { id: input.conversationId, userId: actor.sub },
            select: { id: true, title: true },
          })
        : await transaction.conversation.create({
            data: { userId: actor.sub },
            select: { id: true, title: true },
          });
      if (!ownedConversation) throw new NotFoundException('Conversation not found');

      const versionIds = [
        ...new Set(aiResult.citations.map(({ documentVersionId }) => documentVersionId)),
      ];
      const versions = versionIds.length
        ? await transaction.documentVersion.findMany({
            where: { id: { in: versionIds }, document: { deletedAt: null } },
            select: {
              id: true,
              documentId: true,
              originalFilename: true,
              versionNumber: true,
            },
          })
        : [];
      const versionsById = new Map(versions.map((version) => [version.id, version]));

      const normalizedCitations = aiResult.citations.map((citation, sortOrder) => {
        const version = versionsById.get(citation.documentVersionId);
        if (!version || version.documentId !== citation.documentId) {
          throw new BadGatewayException('AI service returned an unknown citation');
        }
        return {
          documentId: version.documentId,
          documentVersionId: version.id,
          filename: version.originalFilename,
          version: version.versionNumber,
          pageNumber: citation.pageNumber,
          sectionTitle: citation.sectionTitle,
          chunkId: citation.chunkId,
          excerpt: aiResult.excerptsByChunkId.get(citation.chunkId),
          sortOrder,
        };
      });

      await transaction.message.create({
        data: {
          conversationId: ownedConversation.id,
          role: MessageRole.USER,
          content: input.question,
        },
      });
      await transaction.message.create({
        data: {
          conversationId: ownedConversation.id,
          role: MessageRole.ASSISTANT,
          content: assistantContent,
          citations: {
            create: normalizedCitations.map(({ documentId: _documentId, filename: _filename, version: _version, ...citation }) => citation),
          },
        },
      });
      await transaction.conversation.update({
        where: { id: ownedConversation.id },
        data: {
          updatedAt: new Date(),
          ...(ownedConversation.title
            ? {}
            : { title: input.question.slice(0, AUTOMATIC_TITLE_LENGTH) }),
        },
      });

      return {
        conversationId: ownedConversation.id,
        citations: normalizedCitations.map(({ sortOrder: _sortOrder, ...citation }) => citation),
      };
    });

    return aiResult.grounded
      ? {
          conversationId: persisted.conversationId,
          answer: assistantContent,
          citations: persisted.citations,
        }
      : {
          conversationId: persisted.conversationId,
          answer: null,
          message: assistantContent,
          citations: [],
        };
  }

  async appendUserMessage(
    id: string,
    input: CreateUserMessageDto,
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const conversation = await transaction.conversation.findFirst({
        where: { id, userId: actor.sub },
        select: { id: true, title: true },
      });
      if (!conversation) throw new NotFoundException('Conversation not found');

      const message = await transaction.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.USER,
          content: input.content,
        },
        select: {
          id: true,
          conversationId: true,
          role: true,
          content: true,
          createdAt: true,
        },
      });

      await transaction.conversation.update({
        where: { id: conversation.id },
        data: {
          updatedAt: new Date(),
          ...(conversation.title
            ? {}
            : { title: input.content.slice(0, AUTOMATIC_TITLE_LENGTH) }),
        },
      });

      return message;
    });
  }

  private preview(content: string): string {
    return content.length <= MESSAGE_PREVIEW_LENGTH
      ? content
      : `${content.slice(0, MESSAGE_PREVIEW_LENGTH - 1)}…`;
  }
}
