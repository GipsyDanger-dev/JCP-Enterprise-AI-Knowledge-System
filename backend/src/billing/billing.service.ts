import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingCycle, DiscountType, PaymentOrderStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { envOrDefault } from '../config/env.util';
import { CreatePaymentOrderDto, UpsertBillingPlanDto, UpsertCouponDto } from './dto/billing.dto';
import { SumopodSandboxAdapter, SumopodWebhookHeaders } from './sumopod-sandbox.adapter';

const PLAN_SELECT = {
  id: true, slug: true, name: true, description: true, monthlyAmount: true,
  yearlyAmount: true, maxMembers: true, isActive: true,
} as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sumopod: SumopodSandboxAdapter,
  ) {}

  async listPlans() {
    return this.prisma.billingPlan.findMany({ where: { isActive: true }, select: PLAN_SELECT, orderBy: { monthlyAmount: 'asc' } });
  }

  async createInitialOrder(workspaceId: string, input: CreatePaymentOrderDto) {
    return this.createOrderForWorkspace(workspaceId, input);
  }

  assertPaymentConfigured() { this.sumopod.assertConfigured(); }

  async createOrder(actor: AuthenticatedUser, input: CreatePaymentOrderDto) {
    if (actor.accountType !== 'COMPANY') throw new ForbiddenException('Billing hanya tersedia untuk workspace perusahaan');
    return this.createOrderForWorkspace(actor.workspaceId, input);
  }

  private async createOrderForWorkspace(workspaceId: string, input: CreatePaymentOrderDto) {
    const [workspace, plan] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, type: true } }),
      this.prisma.billingPlan.findFirst({ where: { slug: input.planSlug.trim().toLowerCase(), isActive: true }, select: PLAN_SELECT }),
    ]);
    if (!workspace || workspace.type !== 'COMPANY') throw new NotFoundException('Company workspace not found');
    if (!plan) throw new NotFoundException('Billing plan not found');

    const coupon = input.couponCode ? await this.findValidCoupon(input.couponCode) : null;
    const subtotal = input.cycle === BillingCycle.YEARLY ? plan.yearlyAmount : plan.monthlyAmount;
    const discountAmount = coupon ? this.discountFor(coupon, subtotal) : 0;
    const totalAmount = subtotal - discountAmount;
    if (totalAmount < 1) throw new BadRequestException('Payment amount must be greater than zero');

    const providerOrderId = `JCP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const order = await this.prisma.paymentOrder.create({
      data: {
        workspaceId,
        planId: plan.id,
        couponId: coupon?.id,
        providerOrderId,
        cycle: input.cycle,
        subtotal,
        discountAmount,
        totalAmount,
        couponSnapshot: coupon ? { code: coupon.code, discountType: coupon.discountType, value: coupon.value } : undefined,
        expiresAt,
      },
      select: { id: true, providerOrderId: true, totalAmount: true, currency: true, expiresAt: true },
    });

    const payment = await this.sumopod.createPayment({
      orderId: order.providerOrderId,
      amount: order.totalAmount,
      successReturnUrl: this.returnUrl('success', order.id),
      cancelReturnUrl: this.returnUrl('cancel', order.id),
    });
    const updated = await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        providerPaymentId: payment.paymentId,
        paymentLinkUrl: payment.paymentLinkUrl,
        providerFee: payment.fee,
        providerNetAmount: payment.netAmount,
        expiresAt: new Date(payment.expiresAt),
      },
      include: { plan: { select: PLAN_SELECT } },
    });
    return this.orderResponse(updated);
  }

  async getOrder(id: string, actor: AuthenticatedUser) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id }, include: { plan: { select: PLAN_SELECT }, workspace: { select: { id: true, name: true } } } });
    if (!order || (order.workspaceId !== actor.workspaceId && !actor.isPlatformOwner)) throw new NotFoundException('Payment order not found');
    return this.orderResponse(order);
  }

  async getPublicOrder(id: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id }, include: { plan: { select: PLAN_SELECT } } });
    if (!order) throw new NotFoundException('Payment order not found');
    const response = this.orderResponse(order);
    return { id: response.id, orderId: response.orderId, status: response.status, cycle: response.cycle, totalAmount: response.totalAmount, currency: response.currency, expiresAt: response.expiresAt, paidAt: response.paidAt, plan: response.plan };
  }

  async listOrders(actor: AuthenticatedUser) {
    this.assertPlatformOwner(actor);
    const orders = await this.prisma.paymentOrder.findMany({
      include: { plan: { select: PLAN_SELECT }, workspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return orders.map((order) => this.orderResponse(order));
  }

  async handleWebhook(rawBody: string, headers: SumopodWebhookHeaders) {
    this.sumopod.verifyWebhook(rawBody, headers);
    let event: { event_type?: string; data?: Record<string, unknown> };
    try { event = JSON.parse(rawBody) as typeof event; } catch { throw new BadRequestException('Invalid webhook JSON'); }
    const eventType = String(event.event_type ?? '');
    const data = event.data ?? {};
    if (eventType === 'payment.test') return { accepted: true, test: true };
    const eventId = headers.svixId ?? `${String(data.payment_id ?? '')}:${eventType}:${String(data.completed_at ?? data.status ?? '')}`;
    if (!eventId || eventId.startsWith(':')) throw new BadRequestException('Webhook event id is missing');

    try {
      await this.prisma.paymentEvent.create({ data: { provider: 'sumopod', eventId, providerPaymentId: String(data.payment_id ?? '') || null, eventType, payload: event as Prisma.InputJsonValue } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { accepted: true, duplicate: true };
      throw error;
    }
    const providerPaymentId = String(data.payment_id ?? '');
    const providerOrderId = String(data.order_id ?? '');
    const order = await this.prisma.paymentOrder.findFirst({ where: { OR: [{ providerPaymentId }, { providerOrderId }] }, include: { plan: true } });
    if (!order) return { accepted: true, ignored: true };

    if (eventType === 'payment.completed' && order.status === PaymentOrderStatus.PENDING) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + (order.cycle === BillingCycle.YEARLY ? 365 : 30));
      await this.prisma.$transaction(async (transaction) => {
        await transaction.paymentOrder.update({ where: { id: order.id }, data: { status: PaymentOrderStatus.PAID, paidAt: now, providerFee: Number(data.fee ?? order.providerFee ?? 0), providerNetAmount: Number(data.net_amount ?? order.providerNetAmount ?? order.totalAmount) } });
        await transaction.workspace.update({ where: { id: order.workspaceId }, data: { subscriptionStatus: 'ACTIVE', subscriptionPlan: `${order.plan.slug}:${order.cycle.toLowerCase()}`, currentPeriodStartedAt: now, currentPeriodEndsAt: periodEnd } });
        await transaction.user.updateMany({ where: { workspaceId: order.workspaceId }, data: { isActive: true } });
        if (order.couponId) await transaction.coupon.update({ where: { id: order.couponId }, data: { redemptionCount: { increment: 1 } } });
        await transaction.paymentEvent.update({ where: { eventId }, data: { paymentOrderId: order.id } });
      });
    } else if (eventType === 'payment.failed' || eventType === 'payment.expired') {
      await this.prisma.paymentOrder.updateMany({ where: { id: order.id, status: PaymentOrderStatus.PENDING }, data: { status: eventType === 'payment.expired' ? PaymentOrderStatus.EXPIRED : PaymentOrderStatus.FAILED } });
      await this.prisma.paymentEvent.update({ where: { eventId }, data: { paymentOrderId: order.id } });
    } else {
      await this.prisma.paymentEvent.update({ where: { eventId }, data: { paymentOrderId: order.id } });
    }
    return { accepted: true };
  }

  async simulateWebhook(event: Record<string, unknown>, token?: string) {
    if (process.env.SUMOPOD_MODE !== 'sandbox') throw new ForbiddenException('Webhook simulator only available in sandbox');
    const secret = process.env.SUMOPOD_WEBHOOK_SECRET?.trim();
    if (!secret || token !== secret) throw new ForbiddenException('Invalid simulator token');
    return this.handleWebhook(JSON.stringify(event), { webhookToken: token });
  }

  async createPlan(actor: AuthenticatedUser, input: UpsertBillingPlanDto) { this.assertPlatformOwner(actor); return this.prisma.billingPlan.create({ data: { ...input, slug: input.slug.trim().toLowerCase() }, select: PLAN_SELECT }); }
  async updatePlan(actor: AuthenticatedUser, id: string, input: Partial<UpsertBillingPlanDto>) { this.assertPlatformOwner(actor); return this.prisma.billingPlan.update({ where: { id }, data: { ...input, slug: input.slug?.trim().toLowerCase() }, select: PLAN_SELECT }); }
  async listCoupons(actor: AuthenticatedUser) { this.assertPlatformOwner(actor); return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }); }
  async createCoupon(actor: AuthenticatedUser, input: UpsertCouponDto) { this.assertPlatformOwner(actor); return this.prisma.coupon.create({ data: this.couponData(input) as Prisma.CouponUncheckedCreateInput }); }
  async updateCoupon(actor: AuthenticatedUser, id: string, input: Partial<UpsertCouponDto>) { this.assertPlatformOwner(actor); return this.prisma.coupon.update({ where: { id }, data: this.couponData(input) }); }

  private couponData(input: Partial<UpsertCouponDto>): Prisma.CouponUpdateInput {
    return { ...(input.code ? { code: input.code.trim().toUpperCase() } : {}), ...(input.discountType ? { discountType: input.discountType } : {}), ...(input.value !== undefined ? { value: input.value } : {}), ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}), ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}), ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions ?? null } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) };
  }

  private async findValidCoupon(code: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    const now = new Date();
    if (!coupon || !coupon.isActive || (coupon.startsAt && coupon.startsAt > now) || (coupon.endsAt && coupon.endsAt < now) || (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions)) throw new BadRequestException('Coupon is invalid or expired');
    return coupon;
  }

  private discountFor(coupon: { discountType: DiscountType; value: number }, subtotal: number) { return coupon.discountType === DiscountType.PERCENT ? Math.min(subtotal, Math.floor(subtotal * coupon.value / 100)) : Math.min(subtotal, coupon.value); }
  private returnUrl(kind: 'success' | 'cancel', orderId: string) { const base = envOrDefault(kind === 'success' ? 'PAYMENT_SUCCESS_RETURN_URL' : 'PAYMENT_CANCEL_RETURN_URL', 'http://127.0.0.1:5173/billing/return'); return `${base}?status=${kind}&orderId=${encodeURIComponent(orderId)}`; }
  private orderResponse(order: any) { return { id: order.id, orderId: order.providerOrderId, providerPaymentId: order.providerPaymentId, paymentUrl: order.paymentLinkUrl, status: order.status, cycle: order.cycle, subtotal: order.subtotal, discountAmount: order.discountAmount, totalAmount: order.totalAmount, providerFee: order.providerFee, providerNetAmount: order.providerNetAmount, currency: order.currency, expiresAt: order.expiresAt, paidAt: order.paidAt, plan: order.plan, workspace: order.workspace }; }
  private assertPlatformOwner(actor: AuthenticatedUser) { if (!actor.isPlatformOwner) throw new ForbiddenException('Maintainer access required'); }
}
