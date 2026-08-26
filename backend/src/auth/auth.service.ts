import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, AuditActorType } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../database/prisma.service';
import { JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { verifyPassword } from './password.util';
import { randomUUID, createHash } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async login(input: LoginDto, ipAddress?: string, userAgent?: string) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordIsValid = user ? await verifyPassword(input.password, user.passwordHash) : false;

    if (!user || !user.isActive || !passwordIsValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const sessionId = randomUUID();
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, displayName: user.displayName, sid: sessionId };
    const accessToken = await this.jwtService.signAsync(payload);
    
    const decodedToken = this.jwtService.decode(accessToken) as any;
    const expiresAt = new Date(decodedToken.exp * 1000);
    const tokenHash = createHash('sha256').update(accessToken).digest('hex');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash,
          userAgent,
          ipAddress,
          expiresAt,
        }
      });
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          actorType: AuditActorType.USER,
          actorUserId: user.id,
          action: AuditAction.AUTH_LOGIN,
          targetType: 'USER',
          targetId: user.id,
          metadata: { role: user.role } as any,
        }
      });
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  async logout(sessionId: string, userId: string) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() }
      });
      await transaction.auditLog.create({
        data: {
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: AuditAction.AUTH_LOGOUT,
          targetType: 'USER',
          targetId: userId,
          metadata: { sessionId } as any,
        }
      });
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { sub: userId, email: '', role: 'USER' };
    return {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      photoUrl: user.photoUrl,
    };
  }
}
