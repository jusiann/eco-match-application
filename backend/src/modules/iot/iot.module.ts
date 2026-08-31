import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { IotController } from './iot.controller';
import { IotService } from './iot.service';

@Module({
  imports: [NotificationsModule],
  controllers: [IotController],
  providers: [IotService],
  exports: [IotService],
})
export class IotModule {}
