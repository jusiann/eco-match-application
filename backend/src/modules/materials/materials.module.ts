import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { DppService } from './dpp.service';
import { VerifiedFacilityGuard } from '../../common/guards/verified-facility.guard';

@Module({
  imports: [AuthModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, DppService, VerifiedFacilityGuard],
})
export class MaterialsModule {}
