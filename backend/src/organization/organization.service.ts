import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, AuditAction, AuditActorType, Prisma, UserRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  CreateJabatanDto,
  CreateUnitKerjaDto,
  UpdateJabatanDto,
  UpdateRoleLabelDto,
  UpdateUnitKerjaDto,
} from './dto/organization.dto';

/**
 * Role yang boleh diberi nama tampilan sendiri.
 *
 * Sengaja daftar tertutup, bukan seluruh isi enum UserRole: nilai warisan
 * seperti BENDAHARA atau HUMAS tidak lagi dipakai kode mana pun, jadi memberi
 * instansi tombol untuk menamainya hanya akan memunculkan pilihan yang tidak
 * berarti apa-apa di form pembuatan akun.
 */
export const ROLE_YANG_DIPAKAI: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN_UNIT, UserRole.PEGAWAI];

/**
 * Nama tampilan bawaan, dipakai saat workspace lama belum punya barisnya.
 *
 * Kembarannya ada di prisma/reference-data.ts (ROLE_LABEL_BAWAAN) yang mengisi
 * database; yang di sini hanya jaring pengaman untuk pembacaan.
 */
const BAWAAN_ROLE: Record<string, { label: string; description: string }> = {
  [UserRole.SUPER_ADMIN]: { label: 'Admin', description: 'Mengelola seluruh dokumen, pengguna, dan pengaturan workspace.' },
  [UserRole.ADMIN_UNIT]: { label: 'Admin Unit', description: 'Mengelola dokumen milik unit kerjanya sendiri.' },
  [UserRole.PEGAWAI]: { label: 'Pegawai', description: 'Membaca dokumen yang terbuka untuk unit kerjanya.' },
};

const JABATAN_SELECT = {
  id: true,
  name: true,
  canManageAnnouncements: true,
  canViewAnnouncementReaders: true,
  canAssignRequiredReadings: true,
  isActive: true,
  sortOrder: true,
  _count: { select: { users: true } },
} satisfies Prisma.JabatanSelect;

const UNIT_SELECT = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  _count: { select: { users: true, documents: true } },
} satisfies Prisma.UnitKerjaSelect;

/**
 * Kolom mana yang bentrok pada pelanggaran keunikan.
 *
 * Unit kerja dikunci dua kali — pada kode dan pada nama — jadi satu pesan
 * "kode sudah dipakai" akan menyesatkan orang yang sebenarnya mengetik nama
 * yang sudah ada. Prisma menyebutkan kolomnya di `meta.target`; kalau tidak
 * (bentuknya berbeda antarversi), dipakai pesan bawaan yang masih benar.
 */
function pesanKonflik(error: Prisma.PrismaClientKnownRequestError, peta: Record<string, string>, bawaan: string) {
  const target = error.meta?.target;
  const kolom = (Array.isArray(target) ? target : [target]).filter((item): item is string => typeof item === 'string');
  const cocok = Object.entries(peta).find(([kunci]) => kolom.some((item) => item.toLowerCase().includes(kunci)));
  return cocok?.[1] ?? bawaan;
}

function ringkasJabatan<T extends { _count: { users: number } }>(row: T) {
  const { _count, ...jabatan } = row;
  return { ...jabatan, userCount: _count.users };
}

function ringkasUnit<T extends { _count: { users: number; documents: number } }>(row: T) {
  const { _count, ...unit } = row;
  return { ...unit, userCount: _count.users, documentCount: _count.documents };
}

/**
 * Pengelolaan daftar acuan organisasi: unit kerja, jabatan, dan nama tampilan
 * role. Dulu ketiganya hidup sebagai konstanta di prisma/reference-data.ts dan
 * enum di skema, jadi menambah satu jabatan berarti menunggu deploy.
 *
 * Yang TIDAK dipindahkan ke sini adalah perilaku role. Wewenang SUPER_ADMIN dan
 * ADMIN_UNIT tertanam di kode (documents/document-visibility.ts dan RolesGuard),
 * jadi role bikinan baru tidak akan punya aturan apa pun di baliknya dan hanya
 * akan berperilaku seperti PEGAWAI. Yang bisa diubah instansi cuma istilahnya.
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Seluruh daftar acuan dalam satu permintaan — halaman pengelolanya butuh ketiganya sekaligus. */
  async overview(actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const [unitKerja, jabatan, roleLabels] = await Promise.all([
      this.prisma.unitKerja.findMany({
        where: { workspaceId: actor.workspaceId },
        select: UNIT_SELECT,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.jabatan.findMany({
        where: { workspaceId: actor.workspaceId },
        select: JABATAN_SELECT,
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.roleLabels(actor.workspaceId),
    ]);
    return { unitKerja: unitKerja.map(ringkasUnit), jabatan: jabatan.map(ringkasJabatan), roleLabels };
  }

  // ---------------------------------------------------------------- unit kerja

  async createUnitKerja(input: CreateUnitKerjaDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    return this.tulis(AuditAction.USER_CREATED, 'UNIT_KERJA', actor, async (tx) => {
      const unit = await tx.unitKerja.create({
        data: { workspaceId: actor.workspaceId, name: input.name, code: input.code },
        select: UNIT_SELECT,
      });
      return ringkasUnit(unit);
    }, {
      name: 'Unit kerja dengan nama itu sudah ada',
      code: 'Kode unit kerja sudah dipakai di workspace ini',
    });
  }

  async updateUnitKerja(id: string, input: UpdateUnitKerjaDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    await this.unitMilikWorkspace(id, actor);
    return this.tulis(AuditAction.USER_UPDATED, 'UNIT_KERJA', actor, async (tx) => {
      const unit = await tx.unitKerja.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: UNIT_SELECT,
      });
      // `division` pada pegawai adalah salinan teks nama unit yang dipakai di
      // daftar dan laporan. Tanpa disamakan di sini, mengganti nama unit membuat
      // dua tempat menampilkan nama berbeda untuk orang yang sama.
      if (input.name !== undefined) {
        await tx.user.updateMany({ where: { unitKerjaId: id }, data: { division: input.name } });
      }
      return ringkasUnit(unit);
    }, { name: 'Unit kerja dengan nama itu sudah ada' });
  }

  /**
   * Hanya unit yang belum menyentuh siapa pun yang benar-benar dihapus.
   *
   * Unit kerja adalah satu-satunya penentu dokumen mana yang terlihat seorang
   * pegawai. Relasinya `onDelete: SetNull`, jadi menghapus unit yang masih
   * dipakai akan mengosongkan unitKerjaId pemegangnya — dan akses mereka
   * menyusut tanpa pesan apa pun. Karena itu penghapusannya ditolak dan
   * penanya diarahkan menonaktifkan, yang menyembunyikannya dari dropdown tanpa
   * memindahkan siapa-siapa.
   */
  async removeUnitKerja(id: string, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const unit = await this.unitMilikWorkspace(id, actor);
    if (unit._count.users > 0 || unit._count.documents > 0) {
      throw new ConflictException(
        `Unit kerja "${unit.name}" masih dipakai ${unit._count.users} pengguna dan ${unit._count.documents} dokumen. ` +
        'Nonaktifkan saja agar tidak muncul lagi di pilihan, atau pindahkan dulu isinya.',
      );
    }
    return this.tulis(AuditAction.USER_UPDATED, 'UNIT_KERJA', actor, async (tx) => {
      await tx.unitKerja.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  // ------------------------------------------------------------------- jabatan

  async createJabatan(input: CreateJabatanDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    return this.tulis(AuditAction.USER_CREATED, 'JABATAN', actor, async (tx) => {
      const jabatan = await tx.jabatan.create({
        data: {
          workspaceId: actor.workspaceId,
          name: input.name,
          canManageAnnouncements: input.canManageAnnouncements ?? false,
          canViewAnnouncementReaders: input.canViewAnnouncementReaders ?? false,
          canAssignRequiredReadings: input.canAssignRequiredReadings ?? false,
          sortOrder: input.sortOrder ?? 99,
        },
        select: JABATAN_SELECT,
      });
      return ringkasJabatan(jabatan);
    }, { name: 'Jabatan dengan nama itu sudah ada' });
  }

  async updateJabatan(id: string, input: UpdateJabatanDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    await this.jabatanMilikWorkspace(id, actor);
    return this.tulis(AuditAction.USER_UPDATED, 'JABATAN', actor, async (tx) => {
      const jabatan = await tx.jabatan.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.canManageAnnouncements !== undefined ? { canManageAnnouncements: input.canManageAnnouncements } : {}),
          ...(input.canViewAnnouncementReaders !== undefined ? { canViewAnnouncementReaders: input.canViewAnnouncementReaders } : {}),
          ...(input.canAssignRequiredReadings !== undefined ? { canAssignRequiredReadings: input.canAssignRequiredReadings } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: JABATAN_SELECT,
      });
      // Sama alasannya dengan unit kerja: users.job_title adalah salinan teks
      // yang ikut tampil di laporan pembaca pengumuman.
      if (input.name !== undefined) {
        await tx.user.updateMany({ where: { jabatanId: id }, data: { jobTitle: input.name } });
      }
      return ringkasJabatan(jabatan);
    }, { name: 'Jabatan dengan nama itu sudah ada' });
  }

  /** Seperti unit kerja: yang masih dipakai ditolak, bukan dihapus beserta wewenangnya. */
  async removeJabatan(id: string, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const jabatan = await this.jabatanMilikWorkspace(id, actor);
    if (jabatan._count.users > 0) {
      throw new ConflictException(
        `Jabatan "${jabatan.name}" masih dipegang ${jabatan._count.users} pengguna. ` +
        'Nonaktifkan saja agar tidak muncul lagi di pilihan, atau pindahkan dulu pemegangnya.',
      );
    }
    return this.tulis(AuditAction.USER_UPDATED, 'JABATAN', actor, async (tx) => {
      await tx.jabatan.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  // ---------------------------------------------------------------- nama role

  /**
   * Nama tampilan ketiga role, selalu lengkap.
   *
   * Workspace yang dibuat sebelum fitur ini ada bisa saja belum punya barisnya —
   * yang hilang diisi dari konstanta bawaan di memori saja, bukan ditulis ke
   * database, supaya membaca daftar tidak pernah berubah menjadi operasi tulis.
   */
  async roleLabels(workspaceId: string) {
    const tersimpan = await this.prisma.roleLabel.findMany({
      where: { workspaceId, role: { in: ROLE_YANG_DIPAKAI } },
      select: { role: true, label: true, description: true },
    });
    const perRole = new Map(tersimpan.map((baris) => [baris.role, baris]));
    return ROLE_YANG_DIPAKAI.map((role) => perRole.get(role) ?? {
      role,
      label: BAWAAN_ROLE[role].label,
      description: BAWAAN_ROLE[role].description as string | null,
    });
  }

  async updateRoleLabel(role: UserRole, input: UpdateRoleLabelDto, actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    if (!ROLE_YANG_DIPAKAI.includes(role)) {
      throw new BadRequestException(`Role "${role}" tidak dipakai lagi dan namanya tidak bisa diubah`);
    }

    // Diperiksa terhadap daftar EFEKTIF, bukan langsung ke tabel: workspace lama
    // bisa saja belum punya barisnya dan masih memakai nama bawaan. Tanpa ini
    // "Admin Unit" bisa diganti jadi "Admin" selama baris SUPER_ADMIN belum
    // pernah disimpan — indeks unik di database pun tidak menangkapnya, karena
    // memang belum ada baris untuk ditabrak.
    const efektif = await this.roleLabels(actor.workspaceId);
    const diminta = input.label.trim().toLowerCase();
    const bentrok = efektif.find((item) => item.role !== role && item.label.trim().toLowerCase() === diminta);
    if (bentrok) {
      throw new ConflictException(
        `Nama "${bentrok.label}" sudah dipakai role lain. Tiap role harus punya nama yang berbeda, ` +
        'karena nama itulah yang muncul di pilihan Role saat membuat akun.',
      );
    }

    return this.tulis(AuditAction.USER_UPDATED, 'ROLE_LABEL', actor, async (tx) =>
      tx.roleLabel.upsert({
        where: { workspaceId_role: { workspaceId: actor.workspaceId, role } },
        update: { label: input.label, description: input.description ?? null },
        create: { workspaceId: actor.workspaceId, role, label: input.label, description: input.description ?? null },
        select: { role: true, label: true, description: true },
      }),
      // Jaring pengaman kalau dua admin menyimpan nama yang sama berbarengan:
      // pemeriksaan di atas sudah lewat pada keduanya, indeks unik yang menolak.
      { label: 'Nama role itu sudah dipakai role lain' },
    );
  }

  // ------------------------------------------------------------------ utilitas

  private assertAdmin(actor: AuthenticatedUser) {
    if (!actor.isAdmin || actor.accountType !== AccountType.COMPANY) {
      throw new ForbiddenException('Organization admin required');
    }
  }

  private async unitMilikWorkspace(id: string, actor: AuthenticatedUser) {
    const unit = await this.prisma.unitKerja.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: UNIT_SELECT });
    if (!unit) throw new NotFoundException('Unit kerja not found');
    return unit;
  }

  private async jabatanMilikWorkspace(id: string, actor: AuthenticatedUser) {
    const jabatan = await this.prisma.jabatan.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: JABATAN_SELECT });
    if (!jabatan) throw new NotFoundException('Jabatan not found');
    return jabatan;
  }

  /**
   * Menjalankan satu perubahan beserta catatan auditnya dalam satu transaksi,
   * dan menerjemahkan tabrakan keunikan menjadi pesan yang bisa dibaca admin.
   */
  private async tulis<T>(
    action: AuditAction,
    targetType: string,
    actor: AuthenticatedUser,
    jalankan: (tx: Prisma.TransactionClient) => Promise<T>,
    /** Pesan per kolom yang bentrok, mis. { name: '…', code: '…' }. */
    pesanBentrok?: Record<string, string>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const hasil = await jalankan(tx);
        await this.auditLogs.record(tx, {
          actorType: AuditActorType.USER,
          actorUserId: actor.sub,
          workspaceId: actor.workspaceId,
          action,
          targetType,
          targetId: (hasil as { id?: string }).id,
          metadata: hasil as unknown as Prisma.InputJsonValue,
        });
        return hasil;
      });
    } catch (error: unknown) {
      if (pesanBentrok && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(pesanKonflik(error, pesanBentrok, Object.values(pesanBentrok)[0]));
      }
      throw error;
    }
  }
}
