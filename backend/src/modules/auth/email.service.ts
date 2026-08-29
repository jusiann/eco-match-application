import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `https://ecomatch.app/verify-email?token=${token}`;
    this.logger.log(`[STUB] Doğrulama e-postası -> ${to}: ${link}`);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `https://ecomatch.app/reset-password?token=${token}`;
    this.logger.log(`[STUB] Şifre sıfırlama e-postası -> ${to}: ${link}`);
  }
}
