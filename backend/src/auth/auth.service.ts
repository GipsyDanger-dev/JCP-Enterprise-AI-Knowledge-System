import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountType, AuditAction, AuditActorType, Prisma, User, UserRole } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { JwtPayload } from './auth.types';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterPersonalDto } from './dto/register-personal.dto';
import { hashPassword, verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: LoginDto, ipAddress?: string, userAgent?: string) {
    const username = input.username.trim().toLowerCase();
    // Existing accounts without a username may still authenticate with their legacy email.
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
    });
    const passwordIsValid = user?.passwordHash
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

    if (!user || !user.isActive || !passwordIsValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return this.issueApplicationSession(user, 'PASSWORD', ipAddress, userAgent);
  }

  async registerPersonal(
    input: RegisterPersonalDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }

    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          displayName,
          passwordHash,
          accountType: AccountType.PERSONAL,
          role: UserRole.USER,
          isAdmin: false,
          isActive: true,
        },
      });

      return this.issueApplicationSession(user, 'PASSWORD', ipAddress, userAgent, true);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async googleLogin(input: GoogleLoginDto, ipAddress?: string, userAgent?: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException('Google authentication is not configured');
    }

    let googlePayload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: input.credential,
        audience: clientId,
      });
      googlePayload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!googlePayload) throw new UnauthorizedException('Invalid Google credential');
    const googleSubject = googlePayload.sub;
    const email = googlePayload.email?.trim().toLowerCase();
    if (!googleSubject || !email || googlePayload.email_verified !== true) {
      throw new UnauthorizedException('Google account does not provide a verified email');
    }

    let user = await this.prisma.user.findUnique({ where: { googleSubject } });
    let isNewAccount = false;

    if (!user) {
      const existingEmailOwner = await this.prisma.user.findUnique({ where: { email } });
      if (existingEmailOwner) {
        // Never silently link Google to a password/company account. Linking requires
        // explicit proof through the existing account and is a separate flow.
        throw new ConflictException('This email is already registered with another sign-in method');
      }

      user = await this.prisma.user.create({
        data: {
          email,
          displayName: googlePayload.name?.trim() || email.split('@')[0],
          photoUrl: googlePayload.picture,
          accountType: AccountType.PERSONAL,
          googleSubject,
          role: UserRole.USER,
          isAdmin: false,
          isActive: true,
        },
      });
      isNewAccount = true;
    }

    if (!user.isActive || user.accountType !== AccountType.PERSONAL) {
      throw new UnauthorizedException('Personal account is inactive or invalid');
    }

    return this.issueApplicationSession(user, 'GOOGLE', ipAddress, userAgent, isNewAccount);
  }

  private async issueApplicationSession(
    user: User,
    provider: 'PASSWORD' | 'GOOGLE',
    ipAddress?: string,
    userAgent?: string,
    isNewAccount = false,
  ) {
    const sessionId = randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username ?? user.email ?? '',
      role: user.role,
      isAdmin: user.isAdmin,
      accountType: user.accountType,
      displayName: user.displayName,
      sid: sessionId,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const decodedToken = this.jwtService.decode<{ exp?: number }>(accessToken);
    if (!decodedToken?.exp) throw new Error('JWT expiration is missing');

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
        },
      });
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      if (isNewAccount) {
        await transaction.auditLog.create({
          data: {
            actorType: AuditActorType.USER,
            actorUserId: user.id,
            action: AuditAction.USER_CREATED,
            targetType: 'USER',
            targetId: user.id,
            metadata: { provider, accountType: user.accountType },
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorType: AuditActorType.USER,
          actorUserId: user.id,
          action: AuditAction.AUTH_LOGIN,
          targetType: 'USER',
          targetId: user.id,
          metadata: { provider, role: user.role, isAdmin: user.isAdmin, accountType: user.accountType },
        },
      });
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: this.safeProfile(user),
    };
  }

  private safeProfile(user: User) {
    return {
      id: user.id,
      email: user.email,
      username: user.username ?? user.email ?? '',
      displayName: user.displayName,
      employeeNumber: user.employeeNumber ?? '',
      division: user.division ?? '',
      jobTitle: user.jobTitle ?? '',
      role: user.role,
      isAdmin: user.isAdmin,
      accountType: user.accountType,
      photoUrl: user.photoUrl,
    };
  }

  async logout(sessionId: string, userId: string) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          actorType: AuditActorType.USER,
          actorUserId: userId,
          action: AuditAction.AUTH_LOGOUT,
          targetType: 'USER',
          targetId: userId,
          metadata: { sessionId },
        },
      });
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return {
        sub: userId,
        username: '',
        employeeNumber: '',
        division: '',
        jobTitle: '',
        role: UserRole.OPERASIONAL,
        isAdmin: false,
        accountType: AccountType.COMPANY,
      };
    }
    return { sub: user.id, ...this.safeProfile(user) };
  }
}
