import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { OsbsModule } from './modules/osbs/osbs.module';
import { FacilitiesModule } from './modules/facilities/facilities.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { MatchmakingModule } from './modules/matchmaking/matches.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CronModule } from './modules/cron/cron.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60 * 60 * 1000, limit: 1000 }]), // docs/04: "Diğer authenticated"
    AuthModule,
    OsbsModule,
    FacilitiesModule,
    AdminModule,
    AiModule,
    MaterialsModule,
    MatchmakingModule,
    NotificationsModule,
    ReportsModule,
    CronModule,
    HealthModule,
    PrismaModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule {}
