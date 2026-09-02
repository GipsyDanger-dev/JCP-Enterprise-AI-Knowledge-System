import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditActorType, Prisma, UserRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { hashPassword } from '../auth/password.util';
import { PrismaService } from '../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  employeeNumber: true,
  division: true,
  jobTitle: true,
  displayName: true,
  role: true,
  isActive: true,
  photoUrl: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: SAFE_USER_SELECT,
    });
  }

  async create(input: CreateUserDto, actor: AuthenticatedUser) {
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username,
            employeeNumber: input.employeeNumber.trim().toUpperCase(),
            division: input.division.trim(),
            jobTitle: input.jobTitle.trim(),
            displayName,
            passwordHash,
            role: input.role ?? UserRole.USER,
            isActive: true,
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
        return user;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username is already registered');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateUserDto, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName.trim();
    if (input.username !== undefined) data.username = input.username.trim().toLowerCase();
    if (input.employeeNumber !== undefined) data.employeeNumber = input.employeeNumber.trim().toUpperCase();
    if (input.division !== undefined) data.division = input.division.trim();
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle.trim();
    if (input.role !== undefined) data.role = input.role;
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
      return updated;
    });
  }

  async changePassword(id: string, input: ChangePasswordDto, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    return { success: true };
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!user) throw new NotFoundException('User not found');
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
}
