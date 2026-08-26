import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Authentication required');
      }

      // Fire-and-forget update of lastActiveAt
      this.prisma.session.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() }
      }).catch(() => {});

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, isActive: true, displayName: true },
      });

      if (!user?.isActive) throw new UnauthorizedException('Authentication required');
      request.user = { sub: user.id, email: user.email, role: user.role, displayName: user.displayName, sid: payload.sid };
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
