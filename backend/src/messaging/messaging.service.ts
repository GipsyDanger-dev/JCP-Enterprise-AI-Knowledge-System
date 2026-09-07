import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { MessagingEventsService, MessagingStreamEvent } from './messaging-events.service';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: MessagingEventsService,
  ) { }

  /** SSE stream for the authenticated user (employee) or the shared admin channel. */
  stream(actor: AuthenticatedUser): Observable<MessagingStreamEvent> {
    if (actor.accountType !== 'COMPANY') throw new ForbiddenException('Organization account required');
    return this.events.stream(actor.sub, actor.isAdmin, actor.workspaceId);
  }

  /** Get or create a direct conversation between employee and admin */
  async getEmployeeConversation(employeeId: string, actor: AuthenticatedUser) {
    const employee = await this.prisma.user.findFirst({ where: { id: employeeId, workspaceId: actor.workspaceId, accountType: 'COMPANY', isActive: true }, select: { id: true } });
    if (actor.accountType !== 'COMPANY' || !employee) throw new NotFoundException('Employee not found');
    if (!actor.isAdmin && actor.sub !== employeeId) {
      throw new ForbiddenException('You can only access your own conversation');
    }
    let conv = await this.prisma.directConversation.findUnique({
      where: { employeeId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
        employee: {
          select: { id: true, displayName: true, username: true, photoUrl: true },
        },
      },
    });

    if (!conv) {
      conv = await this.prisma.directConversation.create({
        data: { employeeId },
        include: {
          messages: true,
          employee: {
            select: { id: true, displayName: true, username: true, photoUrl: true },
          },
        },
      });
    }

    return {
      ...conv,
      unreadCount: conv.unreadCount < 0 ? Math.abs(conv.unreadCount) : 0,
      adminPhotoUrl: await this.getAdminPhotoUrl(actor.workspaceId),
    };
  }

  /** Admin: list all direct conversations */
  async listConversations(actor: AuthenticatedUser) {
    const convs = await this.prisma.directConversation.findMany({
      where: { employee: { workspaceId: actor.workspaceId, accountType: 'COMPANY' } },
      orderBy: { updatedAt: 'desc' },
      include: {
        employee: {
          select: { id: true, displayName: true, username: true, photoUrl: true },
        },
      },
    });

    return convs.map((conv) => ({
      id: conv.id,
      employeeId: conv.employeeId,
      employeeName: conv.employee.displayName,
      employeeUsername: conv.employee.username ?? '',
      employeePhotoUrl: conv.employee.photoUrl,
      lastMessage: conv.lastMessage ?? '',
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? conv.updatedAt.toISOString(),
      unreadCount: conv.unreadCount > 0 ? conv.unreadCount : 0,
    }));
  }

  /** Get messages in a conversation */
  async getMessages(conversationId: string, actor: AuthenticatedUser) {
    await this.assertConversationAccess(conversationId, actor);
    const messages = await this.prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      sender: msg.sender,
      senderName: msg.senderName,
      content: msg.content,
      attachments: msg.attachments,
      editedAt: msg.editedAt?.toISOString() ?? null,
      createdAt: msg.createdAt.toISOString(),
    }));
  }

  /** Send a message in a conversation */
  async sendMessage(
    conversationId: string,
    sender: string,
    senderName: string,
    content: string,
    attachments: unknown,
    actor: AuthenticatedUser,
  ) {
    await this.assertConversationAccess(conversationId, actor);
    const convId = conversationId;
    const msg = await this.prisma.directMessage.create({
      data: {
        conversationId: convId,
        sender,
        senderName,
        content,
        attachments: attachments as any ?? null,
      },
    });

    // Update conversation and recipient unread count
    const existing = await this.prisma.directConversation.findUnique({
      where: { id: convId },
      select: { unreadCount: true },
    });
    const currentUnread = existing?.unreadCount ?? 0;
    let nextUnread = 0;
    if (sender === 'employee') {
      // Message from employee: increases unread for admin (> 0)
      nextUnread = currentUnread < 0 ? 1 : currentUnread + 1;
    } else {
      // Message from admin: increases unread for employee (< 0)
      nextUnread = currentUnread > 0 ? -1 : currentUnread - 1;
    }

    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: convId },
      select: { employeeId: true },
    });

    await this.prisma.directConversation.update({
      where: { id: convId },
      data: {
        lastMessage: content || this.attachmentLabel(attachments),
        lastMessageAt: new Date(),
        unreadCount: nextUnread,
      },
    });

    const serialized = this.serializeMessage(msg);
    this.events.emitToConversation(conversation?.employeeId ?? actor.sub, {
      type: 'message.created',
      conversationId: convId,
      message: serialized,
    }, actor.workspaceId);

    return serialized;
  }

  /** Reset unread count for current actor */
  async markAsRead(conversationId: string, actor: AuthenticatedUser) {
    await this.assertConversationAccess(conversationId, actor);
    const conv = await this.prisma.directConversation.findUnique({
      where: { id: conversationId },
      select: { unreadCount: true },
    });
    if (!conv) return { success: true };

    // Admin clears employee's unread messages (> 0); Employee clears admin's unread messages (< 0)
    if (actor.isAdmin && conv.unreadCount > 0) {
      await this.prisma.directConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    } else if (!actor.isAdmin && conv.unreadCount < 0) {
      await this.prisma.directConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    }
    return { success: true };
  }

  async editMessage(messageId: string, content: string, actor: AuthenticatedUser) {
    const message = await this.getOwnedMessage(messageId, actor);
    const updated = await this.prisma.directMessage.update({
      where: { id: message.id }, data: { content, editedAt: new Date() },
    });
    await this.refreshConversationPreview(message.conversationId);
    const serialized = this.serializeMessage(updated);
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: message.conversationId },
      select: { employeeId: true },
    });
    this.events.emitToConversation(conversation?.employeeId ?? actor.sub, {
      type: 'message.updated',
      conversationId: message.conversationId,
      message: serialized,
    }, actor.workspaceId);
    return serialized;
  }

  async deleteMessage(messageId: string, actor: AuthenticatedUser) {
    const message = await this.getOwnedMessage(messageId, actor);
    await this.prisma.directMessage.delete({ where: { id: message.id } });
    await this.refreshConversationPreview(message.conversationId);
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: message.conversationId },
      select: { employeeId: true },
    });
    this.events.emitToConversation(conversation?.employeeId ?? actor.sub, {
      type: 'message.deleted',
      conversationId: message.conversationId,
      messageId: message.id,
    }, actor.workspaceId);
    return { success: true, id: message.id };
  }

  /** Broadcast typing state to the other side of a conversation. */
  async setTyping(conversationId: string, typing: boolean, actor: AuthenticatedUser) {
    const conversation = await this.assertConversationAccess(conversationId, actor);
    const event: MessagingStreamEvent = {
      type: 'typing',
      conversationId,
      typing,
      name: actor.displayName ?? (actor.isAdmin ? 'Admin' : 'Employee'),
    };
    if (actor.isAdmin) {
      this.events.emitToEmployee(conversation.employeeId, event);
    } else {
      this.events.emitToAdmins(event, actor.workspaceId);
    }
    return { success: true };
  }

  private async assertConversationAccess(conversationId: string, actor: AuthenticatedUser) {
    if (actor.accountType !== 'COMPANY') throw new ForbiddenException('Organization account required');
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: conversationId, employee: { workspaceId: actor.workspaceId, accountType: 'COMPANY' } },
      select: { employeeId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (!actor.isAdmin && conversation.employeeId !== actor.sub) {
      throw new ForbiddenException('You can only access your own conversation');
    }
    return conversation;
  }

  private async getOwnedMessage(messageId: string, actor: AuthenticatedUser) {
    const message = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertConversationAccess(message.conversationId, actor);
    const expectedSender = actor.isAdmin ? 'admin' : 'employee';
    if (message.sender !== expectedSender) throw new ForbiddenException('You can only change your own messages');
    return message;
  }

  private async refreshConversationPreview(conversationId: string) {
    const latest = await this.prisma.directMessage.findFirst({
      where: { conversationId }, orderBy: { createdAt: 'desc' },
      select: { content: true, attachments: true, createdAt: true },
    });
    await this.prisma.directConversation.update({
      where: { id: conversationId }, data: latest ? {
        lastMessage: latest.content || this.attachmentLabel(latest.attachments), lastMessageAt: latest.createdAt,
      } : { lastMessage: null, lastMessageAt: null }
    });
  }

  private attachmentLabel(attachments: unknown) {
    return Array.isArray(attachments) && attachments.length > 0 ? '(attachment)' : '';
  }

  private async getAdminPhotoUrl(workspaceId: string) {
    const admin = await this.prisma.user.findFirst({ where: { workspaceId, isAdmin: true, isActive: true }, select: { photoUrl: true } });
    return admin?.photoUrl ?? null;
  }

  private serializeMessage(msg: any) {
    return {
      id: msg.id, conversationId: msg.conversationId, sender: msg.sender, senderName: msg.senderName,
      content: msg.content, attachments: msg.attachments, editedAt: msg.editedAt?.toISOString() ?? null,
      createdAt: msg.createdAt.toISOString(),
    };
  }
}
