import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreatePaymentOrderDto, UpsertBillingPlanDto, UpsertCouponDto } from './dto/billing.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  listPlans() { return this.billing.listPlans(); }

  @Post('orders')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  createOrder(@CurrentUser() actor: AuthenticatedUser, @Body() input: CreatePaymentOrderDto) { return this.billing.createOrder(actor, input); }

  @Get('orders/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getOrder(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @CurrentUser() actor: AuthenticatedUser) { return this.billing.getOrder(id, actor); }

  @Get('public/orders/:id')
  publicOrder(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.billing.getPublicOrder(id); }

  @Get('orders')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listOrders(@CurrentUser() actor: AuthenticatedUser) { return this.billing.listOrders(actor); }

  @Post('plans')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  createPlan(@CurrentUser() actor: AuthenticatedUser, @Body() input: UpsertBillingPlanDto) { return this.billing.createPlan(actor, input); }

  @Patch('plans/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updatePlan(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() input: Partial<UpsertBillingPlanDto>) { return this.billing.updatePlan(actor, id, input); }

  @Get('coupons')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listCoupons(@CurrentUser() actor: AuthenticatedUser) { return this.billing.listCoupons(actor); }

  @Post('coupons')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  createCoupon(@CurrentUser() actor: AuthenticatedUser, @Body() input: UpsertCouponDto) { return this.billing.createCoupon(actor, input); }

  @Patch('coupons/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updateCoupon(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() input: Partial<UpsertCouponDto>) { return this.billing.updateCoupon(actor, id, input); }

  @Post('webhooks/sumopod')
  webhook(@Req() request: { body: unknown }, @Headers('svix-id') svixId?: string, @Headers('svix-timestamp') svixTimestamp?: string, @Headers('svix-signature') svixSignature?: string, @Headers('x-webhook-token') webhookToken?: string) {
    const raw = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : JSON.stringify(request.body ?? {});
    return this.billing.handleWebhook(raw, { svixId, svixTimestamp, svixSignature, webhookToken });
  }

  @Post('dev/webhook')
  simulateWebhook(@Body() event: Record<string, unknown>, @Headers('x-sumopod-simulator-token') token?: string) { return this.billing.simulateWebhook(event, token); }
}
