import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, Length, Matches } from 'class-validator';
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
  @IsString() @Length(1, 80) employeeNumber!: string;
  @IsString() @Length(1, 120) division!: string;
  @IsString() @Length(1, 120) jobTitle!: string;
  @IsIn(['general', 'sleman']) aiProfile: string = 'general';
}

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('current')
  current(@CurrentUser() actor: AuthenticatedUser) {
    return this.prisma.workspace.findUniqueOrThrow({
      where: { id: actor.workspaceId }, select: { id: true, name: true, type: true, aiProfile: true },
    });
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    this.assertOwner(actor);
    return this.prisma.workspace.findMany({ where: { type: 'COMPANY' },
      select: { id: true, name: true, aiProfile: true, isActive: true, createdAt: true, _count: { select: { users: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() input: CreateWorkspaceDto, @CurrentUser() actor: AuthenticatedUser) {
    this.assertOwner(actor);
    const passwordHash = await hashPassword(input.adminPassword);
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: {
        name: input.name.trim(), type: 'COMPANY', aiProfile: input.aiProfile,
        users: { create: { username: input.adminUsername.trim().toLowerCase(), displayName: input.adminName.trim(),
          passwordHash, accountType: 'COMPANY', role: 'SUPER_ADMIN', isAdmin: true,
          employeeNumber: input.employeeNumber.trim(), division: input.division.trim(), jobTitle: input.jobTitle.trim() } },
        units: { create: { name: input.division.trim(), code: 'DEFAULT' } },
        categories: { create: [{ name: 'Operations', key: 'operations' }, { name: 'HR', key: 'hr' }, { name: 'Finance', key: 'finance' }] },
      }, select: { id: true, name: true, type: true, aiProfile: true } });
      await tx.auditLog.create({ data: { actorType: 'USER', actorUserId: actor.sub, action: 'USER_CREATED', targetType: 'WORKSPACE', targetId: workspace.id, metadata: { name: workspace.name } } });
      return workspace;
    });
  }

  private assertOwner(actor: AuthenticatedUser) {
    if (!actor.isPlatformOwner || actor.accountType !== 'COMPANY') throw new ForbiddenException('Platform owner required');
  }
}
