import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

type VerificationEmailPurpose = 'PERSONAL_REGISTRATION' | 'PASSWORD_RESET';

@Injectable()
export class VerificationEmailService {
  private readonly logger = new Logger(VerificationEmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string | null;
  private readonly configurationError: string | null;

  constructor() {
    const host = process.env.SMTP_HOST?.trim();
    const from = process.env.SMTP_FROM?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const port = Number(process.env.SMTP_PORT ?? 587);

    if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
      this.transporter = null;
      this.from = null;
      this.configurationError = 'SMTP_HOST, SMTP_PORT, and SMTP_FROM must be configured';
      return;
    }
    if (Boolean(user) !== Boolean(password)) {
      this.transporter = null;
      this.from = null;
      this.configurationError = 'SMTP_USER and SMTP_PASSWORD must either both be set or both be empty';
      return;
    }

    this.from = from;
    this.configurationError = null;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: (process.env.SMTP_SECURE ?? '').trim().toLowerCase() === 'true',
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
  }

  async sendCode(to: string, code: string, purpose: VerificationEmailPurpose): Promise<void> {
    if (!this.transporter || !this.from) {
      throw new ServiceUnavailableException(this.configurationError ?? 'Email delivery is not configured');
    }

    const registration = purpose === 'PERSONAL_REGISTRATION';
    const subject = registration
      ? 'Kode verifikasi akun Enterprise AI'
      : 'Kode reset kata sandi Enterprise AI';
    const action = registration
      ? 'menyelesaikan pendaftaran akun'
      : 'melanjutkan penggantian kata sandi';

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text: `Kode Anda: ${code}\n\nGunakan kode ini untuk ${action}. Kode berlaku selama 10 menit. Jika Anda tidak meminta kode ini, abaikan email ini.`,
        html: `<p>Kode verifikasi Anda:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Gunakan kode ini untuk ${action}. Kode berlaku selama 10 menit.</p><p>Jika Anda tidak meminta kode ini, abaikan email ini.</p>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(`Verification email delivery failed: ${message}`);
      throw new ServiceUnavailableException('Verification email could not be sent');
    }
  }
}
