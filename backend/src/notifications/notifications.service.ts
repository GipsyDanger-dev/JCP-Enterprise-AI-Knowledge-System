import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.appNotification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 12 }),
      this.prisma.appNotification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  async markAllRead(userId: string) {
    await this.prisma.appNotification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  createMany(items: NotificationInput[]) {
    if (items.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.appNotification.createMany({ data: items });
  }
}
