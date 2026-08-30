import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  liveness() {
    return { status: 'ok' };
  }

  // Faz 2.11: DB + AI + Redis. 503 döner, 500 değil (H2) -- istemci "geçici bakımda" gösterir.
  @Get('ready')
  async readiness(@Res() reply: FastifyReply) {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'unreachable';
      healthy = false;
    }

    // AiClientService şu an dummy/yerel (K-24) -- gerçek servis geldiğinde burası onun
    // kendi GET /health'ini çağıracak ve model_version değişimini loglayacak (docs/07).
    checks.ai_service = 'ok (dummy, K-24)';

    // K-22: idempotency cache process-içi Map, Redis hiç kurulmadı -- kontrol edilecek bir şey yok
    checks.redis = 'not_configured';

    reply.status(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', checks });
  }
}
