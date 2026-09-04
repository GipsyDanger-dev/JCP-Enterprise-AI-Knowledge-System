import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { JABATAN_PENERBIT_PENGUMUMAN } from '../../prisma/reference-data';
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
  _count: { select: { reads: true } },
} as const;

/** Kolom pegawai yang ditampilkan di laporan siapa sudah membaca. */
const READER_SELECT = {
  id: true,
  displayName: true,
  employeeNumber: true,
  division: true,
  jobTitle: true,
  unitKerja: { select: { name: true } },
} as const;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Boleh menerbitkan pengumuman dan melihat daftar pembacanya.
   *
   * Dinilai dari jabatan, bukan dari UserRole: role adalah tingkat wewenang
   * atas dokumen, sedangkan yang berhak mengumumkan sesuatu ke seluruh pegawai
   * adalah pimpinan perangkat daerah. Keduanya tidak selalu berjalan seiring —
   * seorang Sekretaris tetap PEGAWAI di mata pengelolaan dokumen.
   */
  private canPublish(actor: AuthenticatedUser) {
    if (actor.isAdmin) return true;
    const jabatan = actor.jobTitle?.trim().toLowerCase() ?? '';
    return jabatan.length > 0 && JABATAN_PENERBIT_PENGUMUMAN.some((item) => item.toLowerCase() === jabatan);
  }

  private assertCanPublish(actor: AuthenticatedUser) {
    if (!this.canPublish(actor)) {
      throw new ForbiddenException('Hanya admin dan ' + JABATAN_PENERBIT_PENGUMUMAN.join(' / ') + ' yang dapat mengelola pengumuman');
    }
  }

  /** Dipakai frontend untuk memutuskan menampilkan tombol terbit dan laporan baca. */
  permissions(actor: AuthenticatedUser) {
    return { canPublish: this.canPublish(actor) };
  }

  /**
   * Jumlah pembaca hanya diberikan kepada yang berhak melihat laporannya —
   * bagi pegawai biasa angka itu tidak berguna dan hanya membocorkan seberapa
   * ramai rekannya membuka pengumuman.
   */
  private toResponse<T extends { _count: { reads: number } }>(row: T, canSeeReaders: boolean) {
    const { _count, ...announcement } = row;
    return { ...announcement, readCount: canSeeReaders ? _count.reads : null };
  }

  async list(actor: AuthenticatedUser) {
    const canSeeReaders = this.canPublish(actor);
    const items = await this.prisma.announcement.findMany({
      // Yang boleh menerbitkan juga melihat arsipnya, supaya tombol aktifkan
      // ulang punya tempat; pegawai lain hanya melihat yang masih berlaku.
      where: canSeeReaders ? {} : { isActive: true },
      select: ANNOUNCEMENT_SELECT,
      orderBy: [{ isActive: 'desc' }, { publishedAt: 'desc' }],
    });
    return items.map((item) => this.toResponse(item, canSeeReaders));
  }

  async create(input: CreateAnnouncementDto, actor: AuthenticatedUser) {
    this.assertCanPublish(actor);
    const announcement = await this.prisma.announcement.create({
      data: { title: input.title, body: input.body, createdById: actor.sub },
      select: ANNOUNCEMENT_SELECT,
    });
    await this.notifyEveryone(announcement, actor.sub);
    return this.toResponse(announcement, true);
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

  async markRead(userId: string) {
    const result = await this.notifications.markReadByType(userId, NotificationType.ANNOUNCEMENT_PUBLISHED);
    await this.recordReads(userId);
    return result;
  }

  /**
   * Membuka halaman pengumuman dicatat sebagai membaca seluruh pengumuman yang
   * aktif saat itu — halaman menampilkan isi lengkap setiap pengumuman, bukan
   * daftar judul, jadi tidak ada langkah "buka satu per satu" yang bisa dicatat
   * lebih halus. Baris yang sudah ada sengaja tidak ditimpa supaya waktu baca
   * pertama tetap utuh.
   */
  private async recordReads(userId: string) {
    const active = await this.prisma.announcement.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (active.length === 0) return;
    await this.prisma.announcementRead.createMany({
      data: active.map((announcement) => ({ announcementId: announcement.id, userId })),
      skipDuplicates: true,
    });
  }

  /**
   * Siapa saja yang sudah dan belum membaca satu pengumuman.
   *
   * Penerbitnya sendiri tidak dihitung sebagai sasaran — ia tidak menerima
   * notifikasinya, jadi memasukkannya ke daftar "belum membaca" hanya membuat
   * laporan tidak pernah bisa penuh.
   */
  async readers(id: string, actor: AuthenticatedUser) {
    this.assertCanPublish(actor);
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true, publishedAt: true },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');

    const [audience, reads] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, id: { not: announcement.createdById } },
        select: READER_SELECT,
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.announcementRead.findMany({
        where: { announcementId: id },
        select: { userId: true, readAt: true },
      }),
    ]);

    const readAtByUser = new Map(reads.map((read) => [read.userId, read.readAt]));
    const people = audience.map(({ id: userId, unitKerja, ...profile }) => ({
      userId,
      ...profile,
      unitKerja: unitKerja?.name ?? null,
      readAt: readAtByUser.get(userId) ?? null,
    }));
    const readers = people
      .filter((person): person is typeof person & { readAt: Date } => person.readAt !== null)
      .sort((a, b) => b.readAt.getTime() - a.readAt.getTime());

    return {
      announcementId: announcement.id,
      title: announcement.title,
      publishedAt: announcement.publishedAt,
      total: people.length,
      readCount: readers.length,
      readers,
      pending: people.filter((person) => person.readAt === null),
    };
  }

  async update(id: string, input: UpdateAnnouncementDto, actor: AuthenticatedUser) {
    this.assertCanPublish(actor);
    const announcement = await this.prisma.announcement.findUnique({ where: { id }, select: { id: true, createdById: true } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    // Pimpinan hanya boleh menyunting dan mengarsipkan pengumumannya sendiri;
    // menyapu pengumuman unit lain bukan bagian dari wewenangnya.
    if (!actor.isAdmin && announcement.createdById !== actor.sub) {
      throw new ForbiddenException('Hanya penerbitnya atau admin yang dapat mengubah pengumuman ini');
    }
    const updated = await this.prisma.announcement.update({ where: { id }, data: input, select: ANNOUNCEMENT_SELECT });
    return this.toResponse(updated, true);
  }
}
