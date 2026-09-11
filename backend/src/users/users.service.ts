import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, AuditAction, AuditActorType, Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { hashPassword } from '../auth/password.util';
import { PrismaService } from '../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { OrganizationService } from '../organization/organization.service';

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  employeeNumber: true,
  division: true,
  jobTitle: true,
  jabatanId: true,
  // Centang wewenangnya ikut dikirim: daftar pengguna dan profil sesi memakai
  // bentuk yang sama, jadi frontend tidak perlu dua tipe untuk hal yang sama.
  jabatan: {
    select: {
      id: true,
      name: true,
      canManageAnnouncements: true,
      canViewAnnouncementReaders: true,
      canAssignRequiredReadings: true,
    },
  },
  displayName: true,
  role: true,
  unitKerjaId: true,
  unitKerja: { select: { id: true, code: true, name: true } },
  isAdmin: true,
  isActive: true,
  photoUrl: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function normalizeUser<T extends { employeeNumber: string | null; division: string | null; jobTitle: string | null }>(user: T) {
  return { ...user, employeeNumber: user.employeeNumber ?? '', division: user.division ?? '', jobTitle: user.jobTitle ?? '' };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly organization: OrganizationService,
  ) {}

  findAll(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { accountType: AccountType.COMPANY, workspaceId: actor.workspaceId },
      orderBy: { createdAt: 'asc' },
      select: SAFE_USER_SELECT,
    }).then((users) => users.map(normalizeUser));
  }

  /**
   * Daftar acuan untuk dropdown di form pembuatan akun.
   *
   * Ketiganya kini baris database, bukan konstanta: unit kerja menentukan
   * dokumen apa yang terlihat, jabatan membawa wewenang pengumuman dan bacaan
   * wajib, dan nama role hanya istilah yang dipilih instansi. Yang dikembalikan
   * hanya yang masih aktif — dropdown adalah tempat memilih untuk ke depan,
   * sedangkan yang sudah telanjur terpasang di seseorang tetap ditampilkan oleh
   * frontend dari data penggunanya sendiri.
   */
  async referenceData(actor: AuthenticatedUser) {
    const [unitKerja, jabatan, roleLabels] = await Promise.all([
      this.prisma.unitKerja.findMany({
        where: { isActive: true, workspaceId: actor.workspaceId },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.jabatan.findMany({
        where: { isActive: true, workspaceId: actor.workspaceId },
        select: {
          id: true,
          name: true,
          canManageAnnouncements: true,
          canViewAnnouncementReaders: true,
          canAssignRequiredReadings: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.organization.roleLabels(actor.workspaceId),
    ]);
    return { unitKerja, jabatan, roleLabels };
  }

  /**
   * Jabatan pilihan admin, dipastikan milik workspace ini.
   *
   * Mengembalikan namanya sekalian karena users.job_title adalah salinan teks
   * yang dipakai daftar dan laporan; menyimpan id tanpa menyalin namanya membuat
   * kedua tempat itu menampilkan jabatan yang sudah basi.
   */
  private async jabatanTerpilih(actor: AuthenticatedUser, jabatanId: string) {
    const jabatan = await this.prisma.jabatan.findFirst({
      where: { id: jabatanId, workspaceId: actor.workspaceId },
      select: { id: true, name: true },
    });
    if (!jabatan) throw new ForbiddenException('Jabatan does not belong to this workspace');
    return jabatan;
  }

  async create(input: CreateUserDto, actor: AuthenticatedUser) {
    await this.assertOrganizationAdmin(actor, input.unitKerjaId);
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const passwordHash = await hashPassword(input.password);
    const jabatan = input.jabatanId ? await this.jabatanTerpilih(actor, input.jabatanId) : null;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username,
            workspaceId: actor.workspaceId,
            isAdmin: input.role === 'SUPER_ADMIN' || input.role === 'ADMIN',
            employeeNumber: input.employeeNumber.trim().toUpperCase(),
            division: input.division.trim(),
            jobTitle: jabatan?.name ?? input.jobTitle?.trim() ?? '',
            jabatanId: jabatan?.id ?? null,
            displayName,
            passwordHash,
            role: input.role ?? 'PEGAWAI',
            unitKerjaId: input.unitKerjaId ?? null,
            isActive: true,
            accountType: AccountType.COMPANY,
          },
          select: SAFE_USER_SELECT,
        });
        await this.auditLogs.record(transaction, {
          actorType: AuditActorType.USER,
          actorUserId: actor.sub,
          action: AuditAction.USER_CREATED,
          targetType: 'USER',
          targetId: user.id,
          metadata: { username: user.username, role: user.role },
        });
        return normalizeUser(user);
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username is already registered');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateUserDto, actor: AuthenticatedUser) {
    await this.assertOrganizationAdmin(actor, input.unitKerjaId);
    const user = await this.prisma.user.findFirst({ where: { id, workspaceId: actor.workspaceId, accountType: AccountType.COMPANY }, select: { id: true, isPlatformOwner: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isPlatformOwner && !actor.isPlatformOwner) throw new ForbiddenException('Cannot modify platform owner');

    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName.trim();
    if (input.username !== undefined) data.username = input.username.trim().toLowerCase();
    if (input.employeeNumber !== undefined) data.employeeNumber = input.employeeNumber.trim().toUpperCase();
    if (input.division !== undefined) data.division = input.division.trim();
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle.trim();
    // jabatanId menang atas jobTitle: kalau keduanya dikirim, nama dari barisnya
    // yang dipakai, supaya teks dan wewenang tidak pernah menunjuk jabatan yang
    // berbeda.
    if (input.jabatanId !== undefined) {
      if (input.jabatanId) {
        const jabatan = await this.jabatanTerpilih(actor, input.jabatanId);
        data.jabatan = { connect: { id: jabatan.id } };
        data.jobTitle = jabatan.name;
      } else {
        data.jabatan = { disconnect: true };
      }
    }
    if (input.role !== undefined) {
      data.role = input.role;
      data.isAdmin = input.role === 'SUPER_ADMIN' || input.role === 'ADMIN';
    }
    if (input.unitKerjaId !== undefined) {
      data.unitKerja = input.unitKerjaId
        ? { connect: { id: input.unitKerjaId } }
        : { disconnect: true };
    }
    if (input.isAdmin !== undefined) data.isAdmin = input.isAdmin;
    if (input.photoUrl !== undefined) data.photoUrl = input.photoUrl;

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data,
        select: SAFE_USER_SELECT,
      });
      await this.auditLogs.record(transaction, {
        actorType: AuditActorType.USER,
        actorUserId: actor.sub,
        action: AuditAction.USER_UPDATED,
        targetType: 'USER',
        targetId: id,
        metadata: input as unknown as Prisma.InputJsonValue,
      });
      return normalizeUser(updated);
    });
  }

  async changePassword(id: string, input: ChangePasswordDto, actor: AuthenticatedUser) {
    await this.assertOrganizationAdmin(actor);
    const user = await this.prisma.user.findFirst({ where: { id, workspaceId: actor.workspaceId, accountType: AccountType.COMPANY }, select: { id: true, isPlatformOwner: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isPlatformOwner && !actor.isPlatformOwner) throw new ForbiddenException('Cannot modify platform owner');

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    return { success: true };
  }

  async remove(id: string, actor: AuthenticatedUser) {
    await this.assertOrganizationAdmin(actor);
    const user = await this.prisma.user.findFirst({ where: { id, workspaceId: actor.workspaceId, accountType: AccountType.COMPANY }, select: { id: true, username: true, isPlatformOwner: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isPlatformOwner) throw new ForbiddenException('Cannot deactivate platform owner');
    if (id === actor.sub) throw new ConflictException('Cannot deactivate your own account');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id },
        data: { isActive: false },
      });
      await this.auditLogs.record(transaction, {
        actorType: AuditActorType.USER,
        actorUserId: actor.sub,
        action: AuditAction.USER_UPDATED,
        targetType: 'USER',
        targetId: id,
        metadata: { action: 'deactivated', username: user.username },
      });
    });

    return { id, isActive: false };
  }
  private async assertOrganizationAdmin(actor: AuthenticatedUser, unitId?: string | null) {
    if (!actor.isAdmin || actor.accountType !== AccountType.COMPANY) throw new ForbiddenException('Organization admin required');
    if (unitId && !await this.prisma.unitKerja.findFirst({ where: { id: unitId, workspaceId: actor.workspaceId, isActive: true }, select: { id: true } })) {
      throw new ForbiddenException('Unit does not belong to this workspace');
    }
  }
}
