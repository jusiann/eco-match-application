import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// @nestjs/throttler bu tipi paket kökünden export etmiyor (sadece dist içi bir dosyadan) --
// throwThrottlingException'ın imzasını değiştirmeden geçmek için burada kullandığımız
// tek alanla (timeToExpire) minimal bir tip tanımlıyoruz.
interface ThrottlerLimitDetail {
  timeToExpire: number;
}

// Global APP_GUARD'lar route seviyesindeki @UseGuards(JwtAuthGuard)'dan ÖNCE çalışır,
// yani bu noktada request.user henüz set edilmemiştir. Kullanıcı bazlı limit (docs/04:
// "Diğer authenticated | 1000/saat | Kullanıcı") için JWT payload'ını burada ayrıca
// (imzayı doğrulamadan) çözüyoruz -- sadece bir izleme anahtarı için, güvenlik kararı
// değil; sahte/bozuk bir jetonla gelen istek kendi başına zararsız bir bucket'a düşer,
// asıl yetki kontrolünü zaten JwtAuthGuard ayrıca yapıyor.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private decodeSub(token: string): string | undefined {
    try {
      const payload = token.split('.')[1];
      const json = Buffer.from(payload, 'base64url').toString('utf8');
      return JSON.parse(json)?.sub;
    } catch {
      return undefined;
    }
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const authHeader: string | undefined = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const sub = this.decodeSub(authHeader.slice(7));
      if (sub) {
        return sub;
      }
    }
    return req.ip ?? 'anonymous';
  }

  protected async throwThrottlingException(_context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    throw new HttpException(
      {
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Çok fazla istek gönderdiniz. ${detail.timeToExpire} saniye sonra tekrar deneyin.`,
        details: { retryAfterSeconds: detail.timeToExpire },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
