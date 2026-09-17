import { Injectable } from '@nestjs/common';
import { AuditAction, AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

export interface RecordAuditLogInput {
  actorType: AuditActorType;
  actorUserId?: string;
  /** Salinan nama pelaku; lihat komentar `actorUsername` di schema. */
  actorUsername?: string;
  actorDisplayName?: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  /**
   * Sengaja wajib. Sebelumnya opsional, dan delapan dari sebelas pemanggilan
   * lupa mengisinya — baris-baris itu hanya bisa ditemukan lewat workspace
   * milik akun pelakunya, sehingga ikut lenyap dari daftar begitu akun itu
   * dihapus. Dengan wajib, yang menjaganya adalah compiler, bukan ingatan.
   */
  workspaceId: string;
}

/**
 * Bagian "siapa pelakunya" untuk kejadian yang dipicu seorang pengguna.
 *
 * Disediakan sebagai satu potongan supaya identitas dan workspace-nya selalu
 * berangkat bersama. Dipisah per baris, keduanya pernah tertinggal.
 */
export function pelakuAktor(actor: AuthenticatedUser) {
  return {
    actorType: AuditActorType.USER,
    actorUserId: actor.sub,
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    workspaceId: actor.workspaceId,
  };
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  record(transaction: Prisma.TransactionClient, input: RecordAuditLogInput) {
    return transaction.auditLog.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        actorUsername: input.actorUsername,
        actorDisplayName: input.actorDisplayName,
        workspaceId: input.workspaceId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      },
      select: { id: true },
    });
  }

  async findAll(query: ListAuditLogsDto, workspaceId: string) {
    const where: Prisma.AuditLogWhereInput = {
      // Dulu ini `OR: [{ workspaceId }, { actorUser: { workspaceId } }]`.
      // Cabang kedua adalah penambal untuk baris yang workspace_id-nya kosong,
      // dan justru cabang itulah yang membuat jejak audit bisa lenyap: ia
      // menemukan barisnya lewat akun pelaku, yang boleh dihapus. Sekarang
      // workspace_id selalu terisi -- baris lama diisi oleh migration, baris
      // baru dijamin tipe -- jadi penambalnya tidak dibutuhkan lagi.
      workspaceId,
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
          actorUsername: true,
          actorDisplayName: true,
          actorUser: {
            select: {
              id: true,
              username: true,
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
