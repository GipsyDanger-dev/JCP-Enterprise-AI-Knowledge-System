import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
  imageDataUrl: true,
  isActive: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, displayName: true } },
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

/** Sudah membaca dan seluruh sasarannya, untuk satu pengumuman. */
type ReadStats = { readCount: number; total: number };

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Boleh menerbitkan, menyunting, mengarsipkan, dan menghapus pengumuman.
   *
   * Dinilai dari jabatan, bukan dari UserRole: role adalah tingkat wewenang
   * atas dokumen, sedangkan yang berhak mengumumkan sesuatu ke seluruh pegawai
   * adalah pimpinan perangkat daerah. Keduanya tidak selalu berjalan seiring —
   * seorang Sekretaris tetap PEGAWAI di mata pengelolaan dokumen.
   *
   * Dulu dicocokkan dengan konstanta JABATAN_PENERBIT_PENGUMUMAN; sekarang
   * dibaca dari centang pada baris jabatannya, yang bisa diatur super admin
   * tanpa deploy ulang.
   */
  private canPublish(actor: AuthenticatedUser) {
    if (actor.accountType !== 'COMPANY') return false;
    return actor.isAdmin || (actor.jabatan?.canManageAnnouncements ?? false);
  }

  /**
   * Boleh melihat siapa saja yang sudah dan belum membaca.
   *
   * Wewenang terpisah dari menerbitkan: ada jabatan yang tugasnya menyebarkan
   * pengumuman tetapi tidak berkepentingan menakar kepatuhan membaca rekannya,
   * dan sebaliknya ada pengawas yang perlu laporannya tanpa perlu menerbitkan
   * apa pun. Sebelum jabatan jadi tabel keduanya masih satu paket.
   */
  private canViewReaders(actor: AuthenticatedUser) {
    if (actor.accountType !== 'COMPANY') return false;
    return actor.isAdmin || (actor.jabatan?.canViewAnnouncementReaders ?? false);
  }

  private assertCanPublish(actor: AuthenticatedUser) {
    if (!this.canPublish(actor)) {
      throw new ForbiddenException('Jabatan Anda tidak diberi wewenang mengelola pengumuman');
    }
  }

  private assertCanViewReaders(actor: AuthenticatedUser) {
    if (!this.canViewReaders(actor)) {
      throw new ForbiddenException('Jabatan Anda tidak diberi wewenang melihat laporan pembaca pengumuman');
    }
  }

  /** Dipakai frontend untuk memutuskan menampilkan tombol terbit dan laporan baca. */
  permissions(actor: AuthenticatedUser) {
    return { canPublish: this.canPublish(actor), canViewReaders: this.canViewReaders(actor) };
  }

  /**
   * Jumlah pembaca hanya diberikan kepada yang berhak melihat laporannya —
   * bagi pegawai biasa angka itu tidak berguna dan hanya membocorkan seberapa
   * ramai rekannya membuka pengumuman.
   */
  private toResponse<T>(row: T, stats: ReadStats | null) {
    return { ...row, readCount: stats?.readCount ?? null, audienceTotal: stats?.total ?? null };
  }

  /** Satu pengumuman beserta hitungan bacanya, untuk balasan create dan update. */
  private async toSingleResponse<T extends { id: string; createdBy: { id: string } }>(row: T, actor: AuthenticatedUser) {
    if (!this.canViewReaders(actor)) return this.toResponse(row, null);
    const stats = await this.readStats(actor.workspaceId, [{ id: row.id, createdById: row.createdBy.id }]);
    return this.toResponse(row, stats.get(row.id) ?? null);
  }

  /**
   * Sudah membaca dan jumlah sasaran per pengumuman, dihitung dengan aturan
   * yang sama persis seperti laporan rincinya: hanya pegawai perusahaan yang
   * masih aktif, dan tanpa penerbitnya sendiri — ia tidak menerima
   * notifikasinya, jadi tidak pernah menjadi sasaran.
   *
   * Dulu dipakai _count relasi mentah, yang ikut menghitung baris baca milik
   * penerbit dan milik akun yang sudah dinonaktifkan. Akibatnya angka di kartu
   * selalu lebih besar daripada "x dari y" yang muncul setelah tombolnya
   * ditekan, padahal keduanya mengaku menghitung hal yang sama.
   */
  private async readStats(workspaceId: string, announcements: readonly { id: string; createdById: string }[]) {
    const stats = new Map<string, ReadStats>();
    if (announcements.length === 0) return stats;

    const ids = announcements.map((announcement) => announcement.id);
    const creatorIds = [...new Set(announcements.map((announcement) => announcement.createdById))];
    const audience = await this.prisma.user.findMany({
      where: { workspaceId, accountType: 'COMPANY', isActive: true },
      select: { id: true },
    });
    const audienceIds = audience.map((user) => user.id);
    const [grouped, creatorReads] = await Promise.all([
      this.prisma.announcementRead.groupBy({
        by: ['announcementId'],
        where: { announcementId: { in: ids }, userId: { in: audienceIds } },
        _count: { _all: true },
      }),
      // Baca milik penerbit dikurangkan belakangan: penerbitnya berbeda pada
      // tiap baris, jadi pengecualiannya tidak bisa ikut masuk ke where di atas.
      this.prisma.announcementRead.findMany({
        where: { announcementId: { in: ids }, userId: { in: creatorIds } },
        select: { announcementId: true, userId: true },
      }),
    ]);
    const readCountById = new Map(grouped.map((row) => [row.announcementId, row._count._all]));
    const readByCreator = new Set(creatorReads.map((read) => read.announcementId + ':' + read.userId));
    const audienceIdSet = new Set(audienceIds);

    for (const announcement of announcements) {
      // Penerbit yang sudah nonaktif tidak ikut terhitung sejak awal, jadi tidak
      // ada yang perlu dikurangkan untuknya.
      const creatorCounted = audienceIdSet.has(announcement.createdById);
      const ownRead = creatorCounted && readByCreator.has(announcement.id + ':' + announcement.createdById);
      stats.set(announcement.id, {
        total: audienceIds.length - (creatorCounted ? 1 : 0),
        readCount: (readCountById.get(announcement.id) ?? 0) - (ownRead ? 1 : 0),
      });
    }
    return stats;
  }

  async list(actor: AuthenticatedUser) {
    const canPublish = this.canPublish(actor);
    const canSeeReaders = this.canViewReaders(actor);
    const items = await this.prisma.announcement.findMany({
      // Yang boleh menerbitkan juga melihat arsipnya, supaya tombol aktifkan
      // ulang punya tempat; pegawai lain hanya melihat yang masih berlaku.
      where: { workspaceId: actor.workspaceId, ...(canPublish ? {} : { isActive: true }) },
      select: ANNOUNCEMENT_SELECT,
      orderBy: [{ isActive: 'desc' }, { publishedAt: 'desc' }],
    });
    const stats = canSeeReaders
      ? await this.readStats(actor.workspaceId, items.map((item) => ({ id: item.id, createdById: item.createdBy.id })))
      : null;
    return items.map((item) => this.toResponse(item, stats?.get(item.id) ?? null));
  }

  async create(input: CreateAnnouncementDto, actor: AuthenticatedUser) {
    this.assertCanPublish(actor);
    const announcement = await this.prisma.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        imageDataUrl: input.imageDataUrl ?? null,
        createdById: actor.sub,
        workspaceId: actor.workspaceId,
      },
      select: ANNOUNCEMENT_SELECT,
    });
    await this.notifyEveryone(announcement, actor.sub, actor.workspaceId);
    return this.toSingleResponse(announcement, actor);
  }

  /** Notifikasi ke seluruh karyawan aktif, kecuali penerbitnya sendiri. */
  private async notifyEveryone(announcement: { id: string; title: string }, authorId: string, workspaceId: string) {
    const recipients = await this.prisma.user.findMany({
      where: { workspaceId, accountType: 'COMPANY', isActive: true, id: { not: authorId } },
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
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { workspaceId: true } });
    const active = await this.prisma.announcement.findMany({
      where: { isActive: true, workspaceId: user.workspaceId },
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
    this.assertCanViewReaders(actor);
    const announcement = await this.prisma.announcement.findUnique({
      where: { id, workspaceId: actor.workspaceId },
      select: { id: true, title: true, createdById: true, publishedAt: true },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');

    const [audience, reads] = await Promise.all([
      this.prisma.user.findMany({
        where: { workspaceId: actor.workspaceId, accountType: 'COMPANY', isActive: true, id: { not: announcement.createdById } },
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

  /**
   * Pengumuman yang boleh diubah aktor ini, atau lemparkan penolakannya.
   *
   * Pimpinan hanya berwenang atas pengumumannya sendiri — menyunting, mengarsipkan,
   * atau menghapus pengumuman unit lain bukan bagian dari wewenangnya; admin bebas.
   */
  private async assertCanEdit(id: string, actor: AuthenticatedUser) {
    this.assertCanPublish(actor);
    const announcement = await this.prisma.announcement.findUnique({ where: { id, workspaceId: actor.workspaceId }, select: { id: true, createdById: true } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    if (!actor.isAdmin && announcement.createdById !== actor.sub) {
      throw new ForbiddenException('Hanya penerbitnya atau admin yang dapat mengubah pengumuman ini');
    }
    return announcement;
  }

  async update(id: string, input: UpdateAnnouncementDto, actor: AuthenticatedUser) {
    await this.assertCanEdit(id, actor);
    const updated = await this.prisma.announcement.update({ where: { id }, data: input, select: ANNOUNCEMENT_SELECT });
    return this.toSingleResponse(updated, actor);
  }

  /**
   * Hapus permanen — berbeda dari mengarsipkan.
   *
   * Arsip hanya menyembunyikan pengumuman dari pegawai dan masih bisa
   * diaktifkan lagi; penghapusan ikut membuang bukti bacanya (cascade), jadi
   * laporan siapa saja yang sudah membaca tidak bisa dipulihkan. Notifikasi
   * yang sudah telanjur terkirim tidak menunjuk pengumuman tertentu, jadi
   * tidak ada tautan yang menggantung setelah barisnya hilang.
   */
  async remove(id: string, actor: AuthenticatedUser) {
    await this.assertCanEdit(id, actor);
    await this.prisma.announcement.delete({ where: { id } });
    return { id, deleted: true };
  }
}
