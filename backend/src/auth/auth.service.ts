import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountType, AuditAction, AuditActorType, Prisma, User, UserRole } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { trialDurationDays } from '../config/env.util';
import { JwtPayload } from './auth.types';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterPersonalDto } from './dto/register-personal.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { CheckCompanyAvailabilityDto } from './dto/check-company-availability.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { hashPassword, verifyPassword } from './password.util';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly billing: BillingService,
  ) {}

  async login(input: LoginDto, ipAddress?: string, userAgent?: string) {
    const username = input.username.trim().toLowerCase();
    // Existing accounts without a username may still authenticate with their legacy email.
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
      include: { workspace: true },
    });
    const passwordIsValid = user?.passwordHash
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

    if (!user || !user.isActive || !user.workspace.isActive || user.accountType !== user.workspace.type || !passwordIsValid) {
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
    const username = input.username.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          username,
          displayName,
          passwordHash,
          accountType: AccountType.PERSONAL,
          workspace: { create: { name: displayName, type: AccountType.PERSONAL } },
          role: UserRole.USER,
          isAdmin: false,
          isActive: true,
        },
      });

      return this.issueApplicationSession(user, 'PASSWORD', ipAddress, userAgent, true);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username or email is already registered');
      }
      throw error;
    }
  }

  async registerCompany(
    input: RegisterCompanyDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }
    if (input.onboardingMode === 'SUBSCRIBE') this.billing.assertPaymentConfigured();
    const email = input.adminEmail.trim().toLowerCase();
    const username = input.adminUsername.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + trialDurationDays() * 24 * 60 * 60 * 1000);

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const workspace = await transaction.workspace.create({
          data: {
            name: input.organizationName.trim(),
            type: AccountType.COMPANY,
            subscriptionStatus: input.onboardingMode === 'SUBSCRIBE' ? 'PENDING_PAYMENT' : 'TRIAL',
            trialStartedAt: input.onboardingMode === 'TRIAL' ? trialStartedAt : null,
            trialEndsAt: input.onboardingMode === 'TRIAL' ? trialEndsAt : null,
            subscriptionPlan: input.onboardingMode === 'TRIAL' ? 'trial' : null,
            users: {
              create: {
                email,
                username,
                displayName: input.adminName.trim(),
                passwordHash,
                accountType: AccountType.COMPANY,
                role: UserRole.SUPER_ADMIN,
                isAdmin: true,
                isActive: input.onboardingMode === 'TRIAL',
              },
            },
            categories: {
              create: [
                { name: 'Operations', key: 'operations' },
                { name: 'HR', key: 'hr' },
                { name: 'Finance', key: 'finance' },
              ],
            },
          },
          include: { users: { where: { username }, take: 1 } },
        });
        const createdUser = workspace.users[0];
        if (!createdUser) throw new Error('Company administrator could not be created');
        await transaction.auditLog.create({
          data: {
            actorType: AuditActorType.USER,
            actorUserId: createdUser.id,
            action: AuditAction.USER_CREATED,
            targetType: 'WORKSPACE',
            targetId: workspace.id,
            workspaceId: workspace.id,
            metadata: { onboardingMode: input.onboardingMode, subscriptionStatus: input.onboardingMode === 'TRIAL' ? 'TRIAL' : 'PENDING_PAYMENT' },
          },
        });
        return { createdUser, workspaceId: workspace.id };
      });

      if (input.onboardingMode === 'SUBSCRIBE') {
        const order = await this.billing.createInitialOrder(result.workspaceId, {
          planSlug: input.planSlug,
          cycle: input.cycle,
          couponCode: input.couponCode,
        });
        return { onboardingMode: 'SUBSCRIBE', orderId: order.id, paymentUrl: order.paymentUrl, expiresAt: order.expiresAt };
      }
      return this.issueApplicationSession(result.createdUser, 'PASSWORD', ipAddress, userAgent, true);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username or email is already registered');
      }
      throw error;
    }
  }

  async checkCompanyAvailability(input: CheckCompanyAvailabilityDto) {
    const username = input.adminUsername.trim().toLowerCase();
    const email = input.adminEmail.trim().toLowerCase();
    const [usernameOwner, emailOwner] = await Promise.all([
      this.prisma.user.findUnique({ where: { username }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);

    return {
      usernameAvailable: !usernameOwner,
      emailAvailable: !emailOwner,
    };
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
        // Google already verified ownership of this email. Linking is safe for a
        // PERSONAL account, but must never convert a company-issued account into
        // a Google login or overwrite an existing Google identity.
        if (existingEmailOwner.accountType !== AccountType.PERSONAL || !existingEmailOwner.isActive) {
          throw new ConflictException('This email is already registered with another sign-in method');
        }
        if (existingEmailOwner.googleSubject && existingEmailOwner.googleSubject !== googleSubject) {
          throw new ConflictException('This email is already linked to another Google account');
        }
        user = await this.prisma.user.update({
          where: { id: existingEmailOwner.id },
          data: {
            googleSubject,
            ...(existingEmailOwner.photoUrl ? {} : { photoUrl: googlePayload.picture ?? null }),
          },
        });
      }

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email,
            displayName: googlePayload.name?.trim() || email.split('@')[0],
            photoUrl: googlePayload.picture,
            accountType: AccountType.PERSONAL,
            googleSubject,
            workspace: { create: { name: googlePayload.name?.trim() || email.split('@')[0], type: AccountType.PERSONAL } },
            role: UserRole.USER,
            isAdmin: false,
            isActive: true,
          },
        });
        isNewAccount = true;
      }
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
    const workspace = await this.prisma.workspace.findUnique({ where: { id: user.workspaceId } });
    if (!workspace?.isActive || workspace.type !== user.accountType) throw new UnauthorizedException('Authentication required');
    await this.assertWorkspaceAvailable(workspace);
    const unitKerja = user.unitKerjaId ? await this.prisma.unitKerja.findFirst({ where: { id: user.unitKerjaId, workspaceId: user.workspaceId }, select: { id: true, code: true, name: true } }) : null;
    const sessionId = randomUUID();
    const payload: JwtPayload = {
      workspaceId: user.workspaceId,
      isPlatformOwner: user.isPlatformOwner,
      unitKerjaId: user.unitKerjaId,
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
      user: { ...this.safeProfile(user), unitKerja, workspaceSubscription: this.subscriptionProfile(workspace) },
    };
  }

  async updateOwnProfile(actor: JwtPayload, input: UpdateOwnProfileDto) {
    if (actor.accountType !== AccountType.PERSONAL) {
      throw new ForbiddenException('Only personal accounts can edit their own profile');
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) data.displayName = input.displayName.trim();
    if (input.username !== undefined) data.username = input.username.trim().toLowerCase();
    if (input.employeeNumber !== undefined) data.employeeNumber = input.employeeNumber.trim().toUpperCase() || null;
    if (input.division !== undefined) data.division = input.division.trim() || null;
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle.trim() || null;

    try {
      const updated = await this.prisma.user.update({
        where: { id: actor.sub },
        data,
        select: {
          id: true,
          username: true,
          displayName: true,
          employeeNumber: true,
          division: true,
          jobTitle: true,
        },
      });
      return {
        ...updated,
        username: updated.username ?? '',
        employeeNumber: updated.employeeNumber ?? '',
        division: updated.division ?? '',
        jobTitle: updated.jobTitle ?? '',
      };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username is already registered');
      }
      throw error;
    }
  }

  private async assertWorkspaceAvailable(workspace: { id: string; subscriptionStatus: 'PENDING_PAYMENT' | 'TRIAL' | 'ACTIVE' | 'EXPIRED'; trialEndsAt: Date | null }) {
    if (workspace.subscriptionStatus === 'PENDING_PAYMENT') throw new UnauthorizedException('Workspace payment is pending');
    if (workspace.subscriptionStatus === 'TRIAL' && workspace.trialEndsAt && workspace.trialEndsAt <= new Date()) {
      await this.prisma.workspace.update({ where: { id: workspace.id }, data: { subscriptionStatus: 'EXPIRED' } });
      throw new UnauthorizedException('Workspace trial has expired');
    }
    if (workspace.subscriptionStatus === 'EXPIRED') throw new UnauthorizedException('Workspace trial has expired');
  }

  private subscriptionProfile(workspace: { subscriptionStatus: string; trialStartedAt: Date | null; trialEndsAt: Date | null; subscriptionPlan: string | null }) {
    return {
      status: workspace.subscriptionStatus,
      trialStartedAt: workspace.trialStartedAt,
      trialEndsAt: workspace.trialEndsAt,
      plan: workspace.subscriptionPlan,
    };
  }

  private safeProfile(user: User) {
    return {
      workspaceId: user.workspaceId,
      isPlatformOwner: user.isPlatformOwner,
      unitKerjaId: user.unitKerjaId,
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
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { unitKerja: { select: { id: true, code: true, name: true } } } });
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
    const workspace = await this.prisma.workspace.findUnique({ where: { id: user.workspaceId } });
    if (workspace) await this.assertWorkspaceAvailable(workspace);
    return { sub: user.id, ...this.safeProfile(user), unitKerja: user.unitKerja, workspaceSubscription: workspace ? this.subscriptionProfile(workspace) : null };
  }
}
