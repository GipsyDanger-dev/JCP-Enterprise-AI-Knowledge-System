import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  isActive: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list(actor: AuthenticatedUser) {
    return this.prisma.announcement.findMany({
      where: actor.isAdmin ? {} : { isActive: true },
      select: ANNOUNCEMENT_SELECT,
      orderBy: [{ isActive: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  async create(input: CreateAnnouncementDto, actor: AuthenticatedUser) {
    const announcement = await this.prisma.announcement.create({
      data: { title: input.title, body: input.body, createdById: actor.sub },
      select: ANNOUNCEMENT_SELECT,
    });
    await this.notifyEveryone(announcement, actor.sub);
    return announcement;
  }

  /** Notifikasi ke seluruh karyawan aktif, kecuali penerbitnya sendiri. */
  private async notifyEveryone(announcement: { id: string; title: string }, authorId: string) {
    const recipients = await this.prisma.user.findMany({
      where: { isActive: true, id: { not: authorId } },
      select: { id: true },
    });
    await this.notifications.createMany(recipients.map((recipient) => ({
      userId: recipient.id,
      type: NotificationType.ANNOUNCEMENT_PUBLISHED,
      title: 'Pengumuman baru',
      body: announcement.title,
      href: '/announcements',
    })));
  }

  async unreadCount(userId: string) {
    const [count, latest] = await Promise.all([
      this.notifications.countUnreadByType(userId, NotificationType.ANNOUNCEMENT_PUBLISHED),
      this.notifications.latestUnreadByType(userId, NotificationType.ANNOUNCEMENT_PUBLISHED),
    ]);
    return { count, latestTitle: latest?.body ?? null };
  }

  markRead(userId: string) {
    return this.notifications.markReadByType(userId, NotificationType.ANNOUNCEMENT_PUBLISHED);
  }

  async update(id: string, input: UpdateAnnouncementDto) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id }, select: { id: true } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return this.prisma.announcement.update({ where: { id }, data: input, select: ANNOUNCEMENT_SELECT });
  }
}
