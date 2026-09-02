import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  list(actor: AuthenticatedUser) {
    return this.prisma.announcement.findMany({
      where: actor.isAdmin ? {} : { isActive: true },
      select: ANNOUNCEMENT_SELECT,
      orderBy: [{ isActive: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  create(input: CreateAnnouncementDto, actor: AuthenticatedUser) {
    return this.prisma.announcement.create({
      data: { title: input.title, body: input.body, createdById: actor.sub },
      select: ANNOUNCEMENT_SELECT,
    });
  }

  async update(id: string, input: UpdateAnnouncementDto) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id }, select: { id: true } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return this.prisma.announcement.update({ where: { id }, data: input, select: ANNOUNCEMENT_SELECT });
  }
}
