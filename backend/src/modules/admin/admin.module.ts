import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaterialsModule } from '../materials/materials.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewQueueService } from './review-queue.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule, MaterialsModule, NotificationsModule],
  controllers: [AdminController, ReviewQueueController],
  providers: [AdminService, ReviewQueueService, RolesGuard],
  exports: [ReviewQueueService],
})
export class AdminModule {}
