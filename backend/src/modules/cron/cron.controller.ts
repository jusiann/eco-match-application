import { Controller, Post, Param, BadRequestException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CronService } from './cron.service';

const JOBS = ['expire-matches', 'hitl-sla-fallback', 'weekly-feedback-export', 'iot-heartbeat'] as const;
type Job = (typeof JOBS)[number];

// Zamanlanmış işleri (2.3/2.7/2.12) beklemeden elle tetiklemek için -- hem operasyonel bir
// ihtiyaç (demo/acil durum) hem de bu mantığı HTTP üzerinden test edebilmenin tek yolu,
// çünkü test paketi uygulamanın DI container'ına değil sadece HTTP'ye erişiyor.
// bkz. health.controller.ts başındaki not -- global 'chat-daily' (50/gün) bütçesinden muaf.
@SkipThrottle({ 'chat-daily': true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/cron')
export class CronController {
  constructor(private readonly cronService: CronService) {}

  @Post(':job')
  async run(@Param('job') job: string) {
    if (!JOBS.includes(job as Job)) {
      throw new BadRequestException({ error: 'VALIDATION_ERROR', message: `job şunlardan biri olmalıdır: ${JOBS.join(', ')}` });
    }

    switch (job as Job) {
      case 'expire-matches': {
        const count = await this.cronService.expireOldMatches();
        return { success: true, message: `${count} eşleşme süresi doldu olarak işaretlendi.`, count };
      }
      case 'hitl-sla-fallback': {
        const count = await this.cronService.hitlSlaFallbackJob();
        return { success: true, message: `${count} inceleme SLA fallback ile otomatik onaylandı.`, count };
      }
      case 'weekly-feedback-export': {
        const result = await this.cronService.exportWeeklyFeedback();
        return { success: true, ...result };
      }
      case 'iot-heartbeat': {
        const result = await this.cronService.iotHeartbeatJob();
        return { success: true, ...result };
      }
    }
  }
}
