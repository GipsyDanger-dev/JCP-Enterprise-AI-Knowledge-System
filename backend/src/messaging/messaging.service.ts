import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get or create a direct conversation between employee and admin */
  async getEmployeeConversation(employeeId: string) {
    const conv = await this.prisma.directConversation.findUnique({
      where: { employeeId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
        employee: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    if (conv) return conv;

    // Create new conversation
    return this.prisma.directConversation.create({
      data: { employeeId },
      include: {
        messages: true,
        employee: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });
  }

  /** Admin: list all direct conversations */
  async listConversations() {
    const convs = await this.prisma.directConversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        employee: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    return convs.map((conv) => ({
      id: conv.id,
      employeeId: conv.employeeId,
      employeeName: conv.employee.displayName,
      employeeEmail: conv.employee.email,
      lastMessage: conv.lastMessage ?? '',
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? conv.updatedAt.toISOString(),
      unreadCount: conv.unreadCount,
    }));
  }

  /** Get messages in a conversation */
  async getMessages(conversationId: string) {
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
      createdAt: msg.createdAt.toISOString(),
    }));
  }

  /** Send a message in a conversation */
  async sendMessage(conversationId: string, sender: string, senderName: string, content: string, attachments?: unknown) {
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

    // Update conversation
    const isEmployee = sender === 'employee';
    await this.prisma.directConversation.update({
      where: { id: convId },
      data: {
        lastMessage: content,
        lastMessageAt: new Date(),
        unreadCount: isEmployee ? { increment: 1 } : 0,
      },
    });

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      sender: msg.sender,
      senderName: msg.senderName,
      content: msg.content,
      attachments: msg.attachments,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  /** Reset unread count */
  async markAsRead(conversationId: string) {
    await this.prisma.directConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    });
    return { success: true };
  }
}
