import { createHmac, timingSafeEqual } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { envOrDefault } from '../config/env.util';

export interface SumopodPaymentRequest {
  orderId: string;
  amount: number;
  successReturnUrl: string;
  cancelReturnUrl: string;
}

export interface SumopodPaymentResponse {
  paymentId: string;
  orderId: string;
  amount: number;
  fee: number;
  netAmount: number;
  paymentLinkUrl: string;
  status: string;
  expiresAt: string;
}

export interface SumopodWebhookHeaders {
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
  webhookToken?: string;
}

export class SumopodSandboxAdapter {
  private readonly baseUrl = envOrDefault('SUMOPOD_PAYMENT_BASE_URL', 'https://api-pay-sandbox.sumopod.com/api/v1').replace(/\/+$/, '');

  private apiKey(): string {
    const key = process.env.SUMOPOD_PAYMENT_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException('SumoPod payment sandbox belum dikonfigurasi');
    return key;
  }

  assertConfigured(): void { this.apiKey(); }

  async createPayment(input: SumopodPaymentRequest): Promise<SumopodPaymentResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.apiKey() },
        body: JSON.stringify({
          order_id: input.orderId,
          amount: input.amount,
          currency: 'IDR',
          expires_in_hours: 24,
          success_return_url: input.successReturnUrl,
          cancel_return_url: input.cancelReturnUrl,
          payment_method_type_code: 'QRIS',
        }),
      });
    } catch {
      throw new ServiceUnavailableException('SumoPod payment sandbox tidak dapat dihubungi');
    }
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload?.payment_id || !payload.payment_link_url) {
      throw new ServiceUnavailableException('SumoPod payment sandbox gagal membuat payment link');
    }
    return {
      paymentId: String(payload.payment_id),
      orderId: String(payload.order_id ?? input.orderId),
      amount: Number(payload.amount ?? input.amount),
      fee: Number(payload.fee ?? 0),
      netAmount: Number(payload.net_amount ?? input.amount),
      paymentLinkUrl: String(payload.payment_link_url),
      status: String(payload.status ?? 'pending'),
      expiresAt: String(payload.expires_at),
    };
  }

  verifyWebhook(rawBody: string, headers: SumopodWebhookHeaders): void {
    const secret = process.env.SUMOPOD_WEBHOOK_SECRET?.trim();
    if (!secret) throw new ServiceUnavailableException('SumoPod webhook secret belum dikonfigurasi');

    const configuredToken = process.env.SUMOPOD_WEBHOOK_TOKEN?.trim();
    if (process.env.SUMOPOD_MODE === 'sandbox' && headers.webhookToken && configuredToken && this.safeEqual(headers.webhookToken, configuredToken)) return;
    if (process.env.SUMOPOD_MODE === 'sandbox' && headers.webhookToken && this.safeEqual(headers.webhookToken, secret)) return;

    if (headers.svixId && headers.svixTimestamp && headers.svixSignature) {
      const timestamp = Number(headers.svixTimestamp);
      if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
        throw new UnauthorizedException('Webhook timestamp is expired');
      }
      const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
      const signedContent = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
      const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');
      const valid = headers.svixSignature.split(' ').some((value) => {
        const signature = value.split(',')[1];
        return signature ? this.safeEqual(signature, expected) : false;
      });
      if (valid) return;
      throw new UnauthorizedException('Invalid webhook signature');
    }

    throw new UnauthorizedException('Webhook signature is required');
  }

  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
