import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { OsbsModule } from './modules/osbs/osbs.module';
import { FacilitiesModule } from './modules/facilities/facilities.module';
import { AdminModule } from './modules/admin/admin.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { MatchmakingModule } from './modules/matchmaking/matches.module';
import { PrismaModule } from './prisma/prisma.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    OsbsModule,
    FacilitiesModule,
    AdminModule,
    MaterialsModule,
    MatchmakingModule,
    PrismaModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
