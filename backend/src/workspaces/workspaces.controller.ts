import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { AuditAction, AuditActorType, Prisma, UserRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { hashPassword } from '../auth/password.util';

class CreateWorkspaceDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 120) adminName!: string;
  @IsString() @Length(3, 80) @Matches(/^[a-zA-Z0-9_.-]+$/) adminUsername!: string;
  @IsString() @Length(10, 128) adminPassword!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(1, 80) employeeNumber?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(1, 120) division?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(1, 120) jobTitle?: string;
}

class UpdateWorkspaceMemberDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(2, 100) displayName?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(3, 80) @Matches(/^[a-zA-Z0-9_.-]+$/) username?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(1, 80) employeeNumber?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(1, 120) division?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(1, 120) jobTitle?: string;
  // Platform owner hanya mengatur dua peran organisasi: admin workspace dan pegawai.
  @IsOptional() @IsIn(['SUPER_ADMIN', 'PEGAWAI']) role?: 'SUPER_ADMIN' | 'PEGAWAI';
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' && !value.trim() ? undefined : value)
  @IsOptional() @IsString() @Length(10, 128) newPassword?: string;
}

const WORKSPACE_MEMBER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  employeeNumber: true,
  division: true,
  jobTitle: true,
  role: true,
  isAdmin: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function normalizeMember<T extends { employeeNumber: string | null; division: string | null; jobTitle: string | null }>(user: T) {
  return { ...user, employeeNumber: user.employeeNumber ?? '', division: user.division ?? '', jobTitle: user.jobTitle ?? '' };
}

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Get('current')
  current(@CurrentUser() actor: AuthenticatedUser) {
    return this.prisma.workspace.findUniqueOrThrow({
      where: { id: actor.workspaceId }, select: { id: true, name: true, type: true, subscriptionStatus: true, trialEndsAt: true },
    });
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    this.assertOwner(actor);
    return this.prisma.workspace.findMany({ where: { type: 'COMPANY' },
      select: { id: true, name: true, isActive: true, subscriptionStatus: true, trialEndsAt: true, createdAt: true, _count: { select: { users: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() input: CreateWorkspaceDto, @CurrentUser() actor: AuthenticatedUser) {
    this.assertOwner(actor);
    const passwordHash = await hashPassword(input.adminPassword);
    const employeeNumber = input.employeeNumber?.trim().toUpperCase() || null;
    const division = input.division?.trim() || null;
    const jobTitle = input.jobTitle?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: {
        name: input.name.trim(), type: 'COMPANY',
        users: { create: { username: input.adminUsername.trim().toLowerCase(), displayName: input.adminName.trim(),
          passwordHash, accountType: 'COMPANY', role: 'SUPER_ADMIN', isAdmin: true,
          employeeNumber, division, jobTitle } },
        ...(division ? { units: { create: { name: division, code: 'DEFAULT' } } } : {}),
        categories: { create: [{ name: 'Operations', key: 'operations' }, { name: 'HR', key: 'hr' }, { name: 'Finance', key: 'finance' }] },
      }, select: { id: true, name: true, type: true, subscriptionStatus: true, trialEndsAt: true } });
      await this.auditLogs.record(tx, {
        actorType: AuditActorType.USER,
        actorUserId: actor.sub,
        action: AuditAction.USER_CREATED,
        targetType: 'WORKSPACE',
        targetId: workspace.id,
        metadata: { name: workspace.name },
      });
      return workspace;
    });
  }

  /**
   * Seluruh akun COMPANY dalam satu workspace organisasi: admin ditampilkan
   * lebih dulu, lalu karyawan. Platform owner menggunakan ini untuk mengawasi
   * siapa yang mengelola tiap organisasi tanpa harus masuk ke workspace-nya.
   */
  @Get(':id/members')
  async members(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthenticatedUser) {
    this.assertOwner(actor);
    const workspace = await this.prisma.workspace.findFirst({ where: { id, type: 'COMPANY' }, select: { id: true, name: true } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const members = await this.prisma.user.findMany({
      where: { workspaceId: id, accountType: 'COMPANY' },
      select: WORKSPACE_MEMBER_SELECT,
      orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }],
    });
    return { workspace, members: members.map(normalizeMember) };
  }

  /**
   * Perbarui akun admin/karyawan sebuah workspace.
   *
   * Workspace owner boleh mengedit profil, mengganti peran, dan mereset
   * password — tetapi tidak boleh menyentuh akun platform owner, dan tidak
   * boleh mencabut admin terakhir yang aktif dari sebuah organisasi.
   */
  @Patch(':id/members/:userId')
  async updateMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: UpdateWorkspaceMemberDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertOwner(actor);
    const workspace = await this.prisma.workspace.findFirst({ where: { id, type: 'COMPANY' }, select: { id: true, name: true } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId: id, accountType: 'COMPANY' },
      select: { id: true, username: true, isPlatformOwner: true, role: true },
    });
    if (!user) throw new NotFoundException('Member not found');
    if (user.isPlatformOwner) throw new ForbiddenException('Cannot modify the platform owner account');

    if (input.role !== undefined && input.role !== 'SUPER_ADMIN' && user.role === 'SUPER_ADMIN') {
      const otherAdmins = await this.prisma.user.count({
        where: { workspaceId: id, accountType: 'COMPANY', isAdmin: true, isActive: true, isPlatformOwner: false, id: { not: userId } },
      });
      if (otherAdmins === 0) throw new ConflictException('Workspace must keep at least one active admin');
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName.trim();
    if (input.username !== undefined) data.username = input.username.trim().toLowerCase();
    if (input.employeeNumber !== undefined) data.employeeNumber = input.employeeNumber.trim().toUpperCase() || null;
    if (input.division !== undefined) data.division = input.division.trim() || null;
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle.trim() || null;
    if (input.role !== undefined) {
      data.role = input.role;
      data.isAdmin = input.role === 'SUPER_ADMIN';
    }
    if (input.newPassword !== undefined) data.passwordHash = await hashPassword(input.newPassword);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data, select: WORKSPACE_MEMBER_SELECT });
      await this.auditLogs.record(tx, {
        actorType: AuditActorType.USER,
        actorUserId: actor.sub,
        action: AuditAction.USER_UPDATED,
        targetType: 'USER',
        targetId: userId,
        metadata: { scope: 'workspace', workspaceId: id, workspaceName: workspace.name, username: updated.username, fields: Object.keys(input) },
      });
      return normalizeMember(updated);
    });
  }

  private assertOwner(actor: AuthenticatedUser) {
    if (!actor.isPlatformOwner || actor.accountType !== 'COMPANY') throw new ForbiddenException('Platform owner required');
  }
}
