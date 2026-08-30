import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { DppService } from './dpp.service';
import { EmbeddingsService } from './embeddings.service';
import { VerifiedFacilityGuard } from '../../common/guards/verified-facility.guard';

@Module({
  imports: [AuthModule, AiModule, NotificationsModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, DppService, EmbeddingsService, VerifiedFacilityGuard],
  exports: [EmbeddingsService],
})
export class MaterialsModule {}
