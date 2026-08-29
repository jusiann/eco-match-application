import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesService } from './facilities.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [FacilitiesController],
  providers: [FacilitiesService, RolesGuard],
})
export class FacilitiesModule {}
