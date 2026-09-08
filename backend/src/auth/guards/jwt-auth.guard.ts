import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedRequest, JwtPayload } from '../auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Authentication required');

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sid },
      });

      if (!session || session.userId !== payload.sub || session.tokenHash !== createHash('sha256').update(token).digest('hex') || session.revokedAt || session.expiresAt <= new Date()) {
        throw new UnauthorizedException('Authentication required');
      }

      this.prisma.session.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() }
      }).catch(() => {});

      // unitKerjaId dan jobTitle sengaja dibaca ulang dari database, bukan
      // diambil dari payload token: pemindahan pegawai ke unit lain — atau
      // penurunan jabatannya — langsung berlaku pada permintaan berikutnya,
      // tanpa menunggu yang bersangkutan login ulang.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, username: true, role: true, isAdmin: true, isActive: true, displayName: true, unitKerjaId: true, jobTitle: true, division: true, accountType: true, workspaceId: true, isPlatformOwner: true, workspace: { select: { isActive: true, type: true, subscriptionStatus: true, trialEndsAt: true } } },
      });

      if (!user?.isActive || !user.workspace.isActive || user.accountType !== user.workspace.type || user.workspaceId !== payload.workspaceId) throw new UnauthorizedException('Authentication required');
      if (user.workspace.subscriptionStatus === 'PENDING_PAYMENT') {
        throw new UnauthorizedException('Workspace payment is pending');
      }
      if (user.workspace.subscriptionStatus === 'EXPIRED' || (user.workspace.subscriptionStatus === 'TRIAL' && user.workspace.trialEndsAt && user.workspace.trialEndsAt <= new Date())) {
        if (user.workspace.subscriptionStatus === 'TRIAL') {
          await this.prisma.workspace.update({ where: { id: user.workspaceId }, data: { subscriptionStatus: 'EXPIRED' } });
        }
        throw new UnauthorizedException('Workspace trial has expired');
      }
      request.user = { sub: user.id, username: user.username ?? user.email ?? '', role: user.role, isAdmin: user.accountType === 'COMPANY' && user.isAdmin, unitKerjaId: user.unitKerjaId, jobTitle: user.jobTitle, division: user.division, displayName: user.displayName, sid: payload.sid, workspaceId: user.workspaceId, accountType: user.accountType, isPlatformOwner: user.isPlatformOwner };
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }

  private extractBearerToken(authorization?: string): string | undefined {
    const [type, token] = authorization?.trim().split(/\s+/) ?? [];
    return type?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
