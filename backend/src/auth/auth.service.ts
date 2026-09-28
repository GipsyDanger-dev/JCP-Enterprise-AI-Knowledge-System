import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountType, AuditAction, AuditActorType, AuthVerificationPurpose, BillingCycle, Prisma, User, UserRole } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { trialDurationDays } from '../config/env.util';
import { JabatanPermissions, JwtPayload } from './auth.types';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterPersonalDto } from './dto/register-personal.dto';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { CheckCompanyAvailabilityDto } from './dto/check-company-availability.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { hashPassword, verifyPassword } from './password.util';
import { BillingService } from '../billing/billing.service';
import { seedJabatanDanRoleLabel } from '../../prisma/organization-defaults';
import { JABATAN_PERMISSION_SELECT, wewenangJabatan } from './jabatan.utils';
import { VerificationEmailService } from './verification-email.service';

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_CODE_COOLDOWN_MS = 60 * 1000;
const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

type PendingPersonalRegistration = {
  displayName: string;
  username: string;
  passwordHash: string;
};

type PendingCompanyRegistration = {
  organizationName: string;
  adminName: string;
  adminUsername: string;
  passwordHash: string;
  onboardingMode: 'TRIAL' | 'SUBSCRIBE';
  planSlug: string;
  cycle: BillingCycle;
  couponCode: string | null;
};

type PendingRegistration = PendingPersonalRegistration | PendingCompanyRegistration;


@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly billing: BillingService,
    private readonly emailService: VerificationEmailService,
  ) {}

  async login(input: LoginDto, ipAddress?: string, userAgent?: string) {
    const username = input.username.trim().toLowerCase();
    // Existing accounts without a username may still authenticate with their legacy email.
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
      include: { workspace: true, jabatan: { select: JABATAN_PERMISSION_SELECT } },
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
  ) {
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }

    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const username = input.username.trim().toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existingUser) throw new ConflictException('Username or email is already registered');

    const passwordHash = await hashPassword(input.password);
    await this.issueVerificationCode(email, AuthVerificationPurpose.PERSONAL_REGISTRATION, {
      payload: { displayName, username, passwordHash },
    });

    return {
      verificationRequired: true as const,
      email,
      expiresInSeconds: VERIFICATION_CODE_TTL_MS / 1000,
      resendAfterSeconds: VERIFICATION_CODE_COOLDOWN_MS / 1000,
    };
  }

  async verifyPersonalRegistration(
    emailInput: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const email = emailInput.trim().toLowerCase();
    const challenge = await this.verifyCode(email, AuthVerificationPurpose.PERSONAL_REGISTRATION, code);
    const payload = this.personalRegistrationPayload(challenge.payload);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            email,
            username: payload.username,
            displayName: payload.displayName,
            passwordHash: payload.passwordHash,
            accountType: AccountType.PERSONAL,
            workspace: { create: { name: payload.displayName, type: AccountType.PERSONAL } },
            role: UserRole.USER,
            isAdmin: false,
            isActive: true,
          },
        });
        await transaction.authVerificationCode.delete({ where: { id: challenge.id } });
        return created;
      });

      return this.issueApplicationSession(user, 'PASSWORD', ipAddress, userAgent, true);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Username or email is already registered');
      }
      throw error;
    }
  }

  async requestPasswordReset(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('No account is registered with this email');
    if (!user.isActive) throw new BadRequestException('This account is inactive');
    if (!user.passwordHash) throw new BadRequestException('This account uses Google sign-in and has no password to reset');

    await this.issueVerificationCode(email, AuthVerificationPurpose.PASSWORD_RESET, { userId: user.id });
    return {
      codeSent: true as const,
      email,
      expiresInSeconds: VERIFICATION_CODE_TTL_MS / 1000,
      resendAfterSeconds: VERIFICATION_CODE_COOLDOWN_MS / 1000,
    };
  }

  async verifyPasswordResetCode(emailInput: string, code: string) {
    const email = emailInput.trim().toLowerCase();
    const challenge = await this.verifyCode(email, AuthVerificationPurpose.PASSWORD_RESET, code);
    if (!challenge.userId) throw new BadRequestException('Invalid password reset request');

    const resetToken = randomBytes(32).toString('base64url');
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    await this.prisma.authVerificationCode.update({
      where: { id: challenge.id },
      data: {
        resetTokenHash,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    return { resetToken, expiresInSeconds: PASSWORD_RESET_TOKEN_TTL_MS / 1000 };
  }

  async resetPassword(resetToken: string, password: string, confirmPassword: string) {
    if (password !== confirmPassword) throw new BadRequestException('Password confirmation does not match');
    const resetTokenHash = createHash('sha256').update(resetToken).digest('hex');
    const challenge = await this.prisma.authVerificationCode.findUnique({
      where: { resetTokenHash },
      include: { user: { select: { id: true, workspaceId: true, isActive: true, accountType: true } } },
    });
    if (
      !challenge
      || challenge.purpose !== AuthVerificationPurpose.PASSWORD_RESET
      || !challenge.verifiedAt
      || challenge.expiresAt <= new Date()
      || !challenge.user?.isActive
    ) {
      throw new BadRequestException('Password reset session is invalid or expired');
    }

    if (challenge.user.accountType === AccountType.COMPANY && password.length < 10) {
      throw new BadRequestException('Company passwords must contain at least 10 characters');
    }

    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: challenge.user!.id }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: challenge.user!.id } });
      await transaction.authVerificationCode.delete({ where: { id: challenge.id } });
      await transaction.auditLog.create({
        data: {
          actorType: AuditActorType.SYSTEM,
          action: AuditAction.AUTH_PASSWORD_RESET,
          targetType: 'USER',
          targetId: challenge.user!.id,
          workspaceId: challenge.user!.workspaceId,
          metadata: { source: 'forgot_password' },
        },
      });
    });

    return { success: true as const };
  }

  async registerCompany(input: RegisterCompanyDto) {
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }
    if (input.onboardingMode === 'SUBSCRIBE') this.billing.assertPaymentConfigured();
    const email = input.adminEmail.trim().toLowerCase();
    const username = input.adminUsername.trim().toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existingUser) throw new ConflictException('Username or email is already registered');

    const passwordHash = await hashPassword(input.password);
    await this.issueVerificationCode(email, AuthVerificationPurpose.COMPANY_REGISTRATION, {
      payload: {
        organizationName: input.organizationName.trim(),
        adminName: input.adminName.trim(),
        adminUsername: username,
        passwordHash,
        onboardingMode: input.onboardingMode,
        planSlug: input.planSlug.trim() || 'starter',
        cycle: input.cycle,
        couponCode: input.couponCode?.trim() || null,
      },
    });

    return {
      verificationRequired: true as const,
      email,
      expiresInSeconds: VERIFICATION_CODE_TTL_MS / 1000,
      resendAfterSeconds: VERIFICATION_CODE_COOLDOWN_MS / 1000,
    };
  }

  async verifyCompanyRegistration(
    emailInput: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const email = emailInput.trim().toLowerCase();
    const challenge = await this.verifyCode(email, AuthVerificationPurpose.COMPANY_REGISTRATION, code);
    const payload = this.companyRegistrationPayload(challenge.payload);
    if (payload.onboardingMode === 'SUBSCRIBE') this.billing.assertPaymentConfigured();

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + trialDurationDays() * 24 * 60 * 60 * 1000);

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const workspace = await transaction.workspace.create({
          data: {
            name: payload.organizationName,
            type: AccountType.COMPANY,
            subscriptionStatus: payload.onboardingMode === 'SUBSCRIBE' ? 'PENDING_PAYMENT' : 'TRIAL',
            trialStartedAt: payload.onboardingMode === 'TRIAL' ? trialStartedAt : null,
            trialEndsAt: payload.onboardingMode === 'TRIAL' ? trialEndsAt : null,
            subscriptionPlan: payload.onboardingMode === 'TRIAL' ? 'trial' : null,
            users: {
              create: {
                email,
                username: payload.adminUsername,
                displayName: payload.adminName,
                passwordHash: payload.passwordHash,
                accountType: AccountType.COMPANY,
                role: UserRole.SUPER_ADMIN,
                isAdmin: true,
                isActive: payload.onboardingMode === 'TRIAL',
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
          include: { users: { where: { username: payload.adminUsername }, take: 1 } },
        });
        const createdUser = workspace.users[0];
        if (!createdUser) throw new Error('Company administrator could not be created');
        // Tanpa ini dropdown jabatan di form "Buat akun" kosong sejak hari
        // pertama, dan admin baru tidak punya cara mengisinya selain mengetik
        // satu per satu.
        await seedJabatanDanRoleLabel(transaction, workspace.id);
        await transaction.authVerificationCode.delete({ where: { id: challenge.id } });
        await transaction.auditLog.create({
          data: {
            actorType: AuditActorType.USER,
            actorUserId: createdUser.id,
            action: AuditAction.USER_CREATED,
            targetType: 'WORKSPACE',
            targetId: workspace.id,
            workspaceId: workspace.id,
            metadata: { onboardingMode: payload.onboardingMode, subscriptionStatus: payload.onboardingMode === 'TRIAL' ? 'TRIAL' : 'PENDING_PAYMENT', emailVerified: true },
          },
        });
        return { createdUser, workspaceId: workspace.id };
      });

      if (payload.onboardingMode === 'SUBSCRIBE') {
        const order = await this.billing.createInitialOrder(result.workspaceId, {
          planSlug: payload.planSlug,
          cycle: payload.cycle,
          couponCode: payload.couponCode ?? undefined,
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

  private async issueVerificationCode(
    email: string,
    purpose: AuthVerificationPurpose,
    options: { payload?: PendingRegistration; userId?: string },
  ) {
    const now = new Date();
    await this.prisma.authVerificationCode.deleteMany({ where: { expiresAt: { lt: now } } });
    const existing = await this.prisma.authVerificationCode.findUnique({
      where: { email_purpose: { email, purpose } },
      select: { createdAt: true },
    });
    if (existing && now.getTime() - existing.createdAt.getTime() < VERIFICATION_CODE_COOLDOWN_MS) {
      throw new HttpException('Please wait before requesting another verification code', HttpStatus.TOO_MANY_REQUESTS);
    }

    const id = randomUUID();
    const code = randomInt(100000, 1000000).toString();
    const codeHash = this.verificationCodeHash(id, email, purpose, code);
    const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_TTL_MS);
    const [, challenge] = await this.prisma.$transaction([
      this.prisma.authVerificationCode.deleteMany({ where: { email, purpose } }),
      this.prisma.authVerificationCode.create({
        data: {
          id,
          email,
          purpose,
          codeHash,
          expiresAt,
          userId: options.userId,
          payload: options.payload,
        },
      }),
    ]);

    try {
      await this.emailService.sendCode(email, code, purpose);
    } catch (error) {
      await this.prisma.authVerificationCode.deleteMany({ where: { id: challenge.id } });
      throw error;
    }
  }

  private async verifyCode(email: string, purpose: AuthVerificationPurpose, code: string) {
    const challenge = await this.prisma.authVerificationCode.findUnique({
      where: { email_purpose: { email, purpose } },
    });
    if (!challenge || challenge.verifiedAt) throw new BadRequestException('Invalid or expired verification code');
    if (challenge.expiresAt <= new Date()) {
      await this.prisma.authVerificationCode.deleteMany({ where: { id: challenge.id } });
      throw new BadRequestException('Invalid or expired verification code');
    }
    if (challenge.attempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
      await this.prisma.authVerificationCode.deleteMany({ where: { id: challenge.id } });
      throw new HttpException('Too many invalid code attempts. Request a new code', HttpStatus.TOO_MANY_REQUESTS);
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const received = Buffer.from(this.verificationCodeHash(challenge.id, email, purpose, code), 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      await this.prisma.authVerificationCode.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired verification code');
    }
    return challenge;
  }

  private verificationCodeHash(id: string, email: string, purpose: AuthVerificationPurpose, code: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required');
    return createHmac('sha256', secret).update(`${id}:${email}:${purpose}:${code}`).digest('hex');
  }

  private personalRegistrationPayload(value: Prisma.JsonValue): PendingPersonalRegistration {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Registration verification data is invalid');
    }
    const displayName = value.displayName;
    const username = value.username;
    const passwordHash = value.passwordHash;
    if (typeof displayName !== 'string' || typeof username !== 'string' || typeof passwordHash !== 'string') {
      throw new BadRequestException('Registration verification data is invalid');
    }
    return { displayName, username, passwordHash };
  }

  private companyRegistrationPayload(value: Prisma.JsonValue): PendingCompanyRegistration {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Registration verification data is invalid');
    }
    const {
      organizationName,
      adminName,
      adminUsername,
      passwordHash,
      onboardingMode,
      planSlug,
      cycle,
      couponCode,
    } = value;
    if (
      typeof organizationName !== 'string'
      || typeof adminName !== 'string'
      || typeof adminUsername !== 'string'
      || typeof passwordHash !== 'string'
      || (onboardingMode !== 'TRIAL' && onboardingMode !== 'SUBSCRIBE')
      || typeof planSlug !== 'string'
      || (cycle !== BillingCycle.MONTHLY && cycle !== BillingCycle.YEARLY)
      || (couponCode !== null && typeof couponCode !== 'string')
    ) {
      throw new BadRequestException('Registration verification data is invalid');
    }
    return {
      organizationName,
      adminName,
      adminUsername,
      passwordHash,
      onboardingMode,
      planSlug,
      cycle,
      couponCode,
    };
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

  /**
   * Profil yang boleh dikirim ke klien.
   *
   * `jabatan` ikut, bukan hanya namanya di `jobTitle`: frontend memakai centang
   * wewenangnya untuk memutuskan tombol mana yang muncul — mis. tombol unggah
   * dokumen pada pemegang jabatan yang dicentang boleh mengunggah. Kedua
   * pemanggilnya sudah memuatnya lewat JABATAN_PERMISSION_SELECT, tetapi daftar
   * kolom di bawah ditulis tangan sehingga hasilnya dibuang lagi di sini, dan
   * AuthProvider yang sudah membacanya selalu menerima undefined.
   */
  private safeProfile(user: User & { jabatan?: (JabatanPermissions & { isActive: boolean }) | null }) {
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
      jabatanId: user.jabatanId,
      // Jabatan yang dinonaktifkan tidak lagi membawa wewenang apa pun; lihat
      // wewenangJabatan. `jobTitle` di atas tetap menampilkan namanya.
      jabatan: wewenangJabatan(user.jabatan),
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
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { unitKerja: { select: { id: true, code: true, name: true } }, jabatan: { select: JABATAN_PERMISSION_SELECT } } });
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
