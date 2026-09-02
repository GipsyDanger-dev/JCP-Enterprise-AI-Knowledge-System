import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const DEFAULT_DUE_DAYS = 7;

function resolveDueAt(value?: string): Date {
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + DEFAULT_DUE_DAYS);
  fallback.setUTCHours(23, 59, 59, 999);
  if (!value) return fallback;
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
  if (Number.isNaN(dueAt.getTime()) || dueAt <= new Date()) throw new BadRequestException('Due date must be in the future');
  return dueAt;
}

@Injectable()
export class RequiredReadingsService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  async assign(documentId: string, userIds: string[], dueAtInput?: string) {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) throw new BadRequestException('Select at least one active employee');
    const dueAt = resolveDueAt(dueAtInput);
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null, status: DocumentStatus.READY }, select: { id: true, title: true } });
    if (!doc) throw new NotFoundException('Ready document not found');
    const users = await this.prisma.user.findMany({ where: { id: { in: uniqueUserIds }, isAdmin: false, isActive: true }, select: { id: true, displayName: true, employeeNumber: true } });
    if (users.length === 0) throw new BadRequestException('No active employees were selected');

    const existing = await this.prisma.requiredReading.findMany({ where: { documentId, userId: { in: users.map((user) => user.id) } }, select: { userId: true } });
    const existingIds = new Set(existing.map((item) => item.userId));
    const newUsers = users.filter((user) => !existingIds.has(user.id));

    await this.prisma.$transaction([
      this.prisma.requiredReading.createMany({ data: newUsers.map((user) => ({ documentId, userId: user.id, dueAt })), skipDuplicates: true }),
      this.prisma.requiredReading.updateMany({ where: { documentId, userId: { in: existing.map((item) => item.userId) }, completedAt: null }, data: { dueAt } }),
    ]);

    const dueLabel = dueAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    await this.notifications.createMany(newUsers.map((user) => ({ userId: user.id, type: NotificationType.REQUIRED_READING_ASSIGNED, title: 'Dokumen wajib baca baru', body: `${doc.title} harus dibaca sebelum ${dueLabel}.`, href: `/documents?doc=${doc.id}` })));
    return { assigned: newUsers.length, updated: existing.length, users, dueAt };
  }

  async mine(userId: string) {
    const now = new Date();
    const items = await this.prisma.requiredReading.findMany({ where: { userId, document: { deletedAt: null, status: DocumentStatus.READY } }, orderBy: { assignedAt: 'desc' }, select: { id: true, documentId: true, progress: true, dueAt: true, completedAt: true, document: { select: { title: true, collection: true } } } });
    return items.map((item) => ({ ...item, isOverdue: !item.completedAt && item.dueAt < now }));
  }

  async updateProgress(id: string, userId: string, progress?: number) {
    if (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 99) throw new BadRequestException('Progress must be an integer from 0 to 99');
    const item = await this.prisma.requiredReading.findFirst({ where: { id, userId }, select: { id: true, progress: true, completedAt: true } });
    if (!item) throw new NotFoundException('Required reading not found');
    if (item.completedAt) return { id: item.id, progress: 100, completedAt: item.completedAt };
    const next = Math.max(item.progress, progress);
    return this.prisma.requiredReading.update({ where: { id }, data: { progress: next, lastProgressAt: new Date() }, select: { id: true, progress: true, completedAt: true } });
  }

  async complete(id: string, userId: string) {
    const item = await this.prisma.requiredReading.findFirst({ where: { id, userId }, select: { id: true, progress: true, completedAt: true, document: { select: { id: true, title: true } }, user: { select: { displayName: true } } } });
    if (!item) throw new NotFoundException('Required reading not found');
    if (item.completedAt) return { id: item.id, progress: 100, completedAt: item.completedAt };
    if (item.progress < 95) throw new BadRequestException('Document has not been read to the end');
    const completed = await this.prisma.requiredReading.update({ where: { id }, data: { progress: 100, completedAt: new Date(), lastProgressAt: new Date() }, select: { id: true, progress: true, completedAt: true } });
    const admins = await this.prisma.user.findMany({ where: { isAdmin: true, isActive: true }, select: { id: true } });
    await this.notifications.createMany(admins.map((admin) => ({ userId: admin.id, type: NotificationType.REQUIRED_READING_COMPLETED, title: 'Wajib baca diselesaikan', body: `${item.user.displayName} telah membaca ${item.document.title}.`, href: '/' })));
    return completed;
  }

  async report() {
    const now = new Date();
    const items = await this.prisma.requiredReading.findMany({ select: { progress: true, dueAt: true, completedAt: true, user: { select: { displayName: true, employeeNumber: true, division: true, jobTitle: true } }, document: { select: { id: true, title: true } } } });
    const map = new Map<string, { documentId: string; title: string; total: number; completed: number; overdue: number; readers: Array<Record<string, unknown>> }>();
    for (const item of items) {
      const row = map.get(item.document.id) ?? { documentId: item.document.id, title: item.document.title, total: 0, completed: 0, overdue: 0, readers: [] };
      const isOverdue = !item.completedAt && item.dueAt < now;
      row.total += 1;
      if (item.progress === 100) row.completed += 1;
      if (isOverdue) row.overdue += 1;
      row.readers.push({ ...item.user, progress: item.progress, dueAt: item.dueAt, completedAt: item.completedAt, isOverdue });
      map.set(item.document.id, row);
    }
    return [...map.values()].map((row) => ({ ...row, progress: row.total ? Math.round(row.completed / row.total * 100) : 0 }));
  }
}
