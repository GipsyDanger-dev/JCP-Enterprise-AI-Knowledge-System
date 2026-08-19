import { Injectable } from '@nestjs/common';
import { AuditAction, AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

export interface RecordAuditLogInput {
  actorType: AuditActorType;
  actorUserId?: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  record(transaction: Prisma.TransactionClient, input: RecordAuditLogInput) {
    return transaction.auditLog.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      },
      select: { id: true },
    });
  }

  async findAll(query: ListAuditLogsDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
        select: {
          id: true,
          actorType: true,
          actorUserId: true,
          actorUser: {
            select: {
              id: true,
              email: true,
              displayName: true,
              role: true,
            },
          },
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
