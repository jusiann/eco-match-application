import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule, NotificationsModule, AdminModule],
  controllers: [CronController],
  providers: [CronService, RolesGuard],
  exports: [CronService],
})
export class CronModule {}
