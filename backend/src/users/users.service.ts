import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, AuditAction, AuditActorType, Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { hashPassword } from '../auth/password.util';
import { PrismaService } from '../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JABATAN } from '../../prisma/reference-data';

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  employeeNumber: true,
  division: true,
  jobTitle: true,
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
  ) {}

  findAll(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { accountType: AccountType.COMPANY, workspaceId: actor.workspaceId },
      orderBy: { createdAt: 'asc' },
      select: SAFE_USER_SELECT,
    }).then((users) => users.map(normalizeUser));
  }

  /**
   * Daftar acuan untuk dropdown di form pengguna.
   *
   * Unit kerja dibaca dari database (bisa berubah tanpa deploy), sedangkan
   * jabatan berasal dari konstanta karena murni keterangan dan tidak
   * memengaruhi hak akses apa pun.
   */
  async referenceData(actor: AuthenticatedUser) {
    const unitKerja = await this.prisma.unitKerja.findMany({
      where: { isActive: true, workspaceId: actor.workspaceId },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { unitKerja, jabatan: JABATAN };
  }

  async create(input: CreateUserDto, actor: AuthenticatedUser) {
    await this.assertOrganizationAdmin(actor, input.unitKerjaId);
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username,
            workspaceId: actor.workspaceId,
            isAdmin: input.role === 'SUPER_ADMIN' || input.role === 'ADMIN',
            employeeNumber: input.employeeNumber.trim().toUpperCase(),
            division: input.division.trim(),
            jobTitle: input.jobTitle.trim(),
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
