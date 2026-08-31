import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

// IoT sensörleri JWT değil, X-Api-Key header'ıyla kimlik doğrular (docs/03: "api_key bir rol
// değil, ayrı bir kimlik yöntemi"). Anahtar hash'i SHA-256 (K-15 ile aynı gerekçe: uzun,
// sistem üretimi bir token bcrypt'e verilmez). Doğrulanan kullanıcı + tesisi
// request.apiKeyUser'a yazılır, controller/service bunu kullanır.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger('ApiKeyGuard');

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey: string | undefined = request.headers?.['x-api-key'];

    if (!rawKey) {
      this.logger.warn('unauth_sensor: X-Api-Key header eksik');
      throw new UnauthorizedException({ error: 'API_KEY_MISSING', message: 'X-Api-Key header eksik.' });
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: { select: { id: true, facilityId: true } } },
    });

    const now = new Date();
    if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt < now)) {
      this.logger.warn('unauth_sensor: geçersiz, iptal edilmiş veya süresi dolmuş API anahtarı');
      throw new UnauthorizedException({ error: 'API_KEY_INVALID', message: 'Geçersiz API anahtarı.' });
    }

    void this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsed: now } }).catch(() => {});

    request.apiKeyUser = { userId: apiKey.userId, facilityId: apiKey.user.facilityId };
    return true;
  }
}
