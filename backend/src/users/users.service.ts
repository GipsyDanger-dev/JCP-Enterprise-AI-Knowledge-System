import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, AuditActorType, Prisma, UserRole } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { hashPassword } from '../auth/password.util';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
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
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: SAFE_USER_SELECT,
    });
  }

  async create(input: CreateUserDto, actor: AuthenticatedUser) {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email,
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
          metadata: { email: user.email, role: user.role },
        });
        return user;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email address is already registered');
      }
      throw error;
    }
  }

  async deactivate(id: string, actor: AuthenticatedUser): Promise<void> {
    if (id === actor.sub) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    await this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findFirst({
          where: { id, isActive: true },
          select: { id: true, email: true, role: true },
        });
        if (!user) throw new NotFoundException('Active user not found');

        if (user.role === UserRole.ADMIN) {
          const activeAdminCount = await transaction.user.count({
            where: { role: UserRole.ADMIN, isActive: true },
          });
          if (activeAdminCount <= 1) {
            throw new ConflictException('The last active admin cannot be deactivated');
          }
        }

        await transaction.user.update({
          where: { id: user.id },
          data: { isActive: false },
        });
        await this.auditLogs.record(transaction, {
          actorType: AuditActorType.USER,
          actorUserId: actor.sub,
          action: AuditAction.USER_DEACTIVATED,
          targetType: 'USER',
          targetId: user.id,
          metadata: { email: user.email, role: user.role },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
