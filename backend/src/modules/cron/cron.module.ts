import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';
import { IotModule } from '../iot/iot.module';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule, NotificationsModule, AdminModule, IotModule],
  controllers: [CronController],
  providers: [CronService, RolesGuard],
  exports: [CronService],
})
export class CronModule {}
