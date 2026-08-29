import { Injectable, Logger } from '@nestjs/common';

// STUB: no SMTP/SendGrid provider is wired up yet (see docs/10-gelistirme-rehberi.md
// SMTP_* / SENDGRID_API_KEY). This logs the link that would be emailed so the
// verification flow is testable end-to-end before a real provider is chosen.
@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `https://ecomatch.app/verify-email?token=${token}`;
    this.logger.log(`[STUB] Doğrulama e-postası -> ${to}: ${link}`);
  }
}
