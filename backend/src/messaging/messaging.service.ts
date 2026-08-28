import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) { }

  /** Get or create a direct conversation between employee and admin */
  async getEmployeeConversation(employeeId: string, actor: AuthenticatedUser) {
    if (actor.role !== UserRole.ADMIN && actor.sub !== employeeId) {
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
          select: { id: true, displayName: true, email: true, photoUrl: true },
        },
      },
    });

    if (!conv) {
      conv = await this.prisma.directConversation.create({
        data: { employeeId },
        include: {
          messages: true,
          employee: {
            select: { id: true, displayName: true, email: true, photoUrl: true },
          },
        },
      });
    }

    return {
      ...conv,
      unreadCount: conv.unreadCount < 0 ? Math.abs(conv.unreadCount) : 0,
      adminPhotoUrl: await this.getAdminPhotoUrl(),
    };
  }

  /** Admin: list all direct conversations */
  async listConversations() {
    const convs = await this.prisma.directConversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        employee: {
          select: { id: true, displayName: true, email: true, photoUrl: true },
        },
      },
    });

    return convs.map((conv) => ({
      id: conv.id,
      employeeId: conv.employeeId,
      employeeName: conv.employee.displayName,
      employeeEmail: conv.employee.email,
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

    await this.prisma.directConversation.update({
      where: { id: convId },
      data: {
        lastMessage: content || this.attachmentLabel(attachments),
        lastMessageAt: new Date(),
        unreadCount: nextUnread,
      },
    });

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      sender: msg.sender,
      senderName: msg.senderName,
      content: msg.content,
      attachments: msg.attachments,
      editedAt: msg.editedAt?.toISOString() ?? null,
      createdAt: msg.createdAt.toISOString(),
    };
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
    if (actor.role === UserRole.ADMIN && conv.unreadCount > 0) {
      await this.prisma.directConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 },
      });
    } else if (actor.role !== UserRole.ADMIN && conv.unreadCount < 0) {
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
    }).then(async (created) => ({ ...created, adminPhotoUrl: await this.getAdminPhotoUrl() }));
    await this.refreshConversationPreview(message.conversationId);
    return this.serializeMessage(updated);
  }

  async deleteMessage(messageId: string, actor: AuthenticatedUser) {
    const message = await this.getOwnedMessage(messageId, actor);
    await this.prisma.directMessage.delete({ where: { id: message.id } });
    await this.refreshConversationPreview(message.conversationId);
    return { success: true, id: message.id };
  }

  private async assertConversationAccess(conversationId: string, actor: AuthenticatedUser) {
    const conversation = await this.prisma.directConversation.findUnique({
      where: { id: conversationId },
      select: { employeeId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (actor.role !== UserRole.ADMIN && conversation.employeeId !== actor.sub) {
      throw new ForbiddenException('You can only access your own conversation');
    }
    return conversation;
  }

  private async getOwnedMessage(messageId: string, actor: AuthenticatedUser) {
    const message = await this.prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    await this.assertConversationAccess(message.conversationId, actor);
    const expectedSender = actor.role === UserRole.ADMIN ? 'admin' : 'employee';
    if (message.sender !== expectedSender) throw new ForbiddenException('You can only change your own messages');
    return message;
  }

  private async refreshConversationPreview(conversationId: string) {
    const latest = await this.prisma.directMessage.findFirst({
      where: { conversationId }, orderBy: { createdAt: 'desc' },
      select: { content: true, attachments: true, createdAt: true },
    }).then(async (created) => ({ ...created, adminPhotoUrl: await this.getAdminPhotoUrl() }));
    await this.prisma.directConversation.update({
      where: { id: conversationId }, data: latest ? {
        lastMessage: latest.content || this.attachmentLabel(latest.attachments), lastMessageAt: latest.createdAt,
      } : { lastMessage: null, lastMessageAt: null }
    });
  }

  private attachmentLabel(attachments: unknown) {
    return Array.isArray(attachments) && attachments.length > 0 ? '(attachment)' : '';
  }

  private async getAdminPhotoUrl() {
    const admin = await this.prisma.user.findFirst({ where: { role: UserRole.ADMIN, isActive: true }, select: { photoUrl: true } });
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
