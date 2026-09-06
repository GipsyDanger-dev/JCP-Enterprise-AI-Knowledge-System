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

  /** Jumlah notifikasi belum dibaca untuk satu tipe (mis. badge pengumuman). */
  countUnreadByType(userId: string, type: NotificationType) {
    return this.prisma.appNotification.count({ where: { userId, type, readAt: null } });
  }

  /** Notifikasi belum dibaca paling baru untuk satu tipe. */
  latestUnreadByType(userId: string, type: NotificationType) {
    return this.prisma.appNotification.findFirst({
      where: { userId, type, readAt: null },
      orderBy: { createdAt: 'desc' },
      select: { title: true, body: true },
    });
  }

  /** Tandai terbaca hanya untuk satu tipe, tanpa mengganggu notifikasi lain. */
  async markReadByType(userId: string, type: NotificationType) {
    const { count } = await this.prisma.appNotification.updateMany({
      where: { userId, type, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, count };
  }

  createMany(items: NotificationInput[]) {
    if (items.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.appNotification.createMany({ data: items });
  }
}
