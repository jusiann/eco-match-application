import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OsbDashboardController } from './osb-dashboard.controller';
import { OsbDashboardService } from './osb-dashboard.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [OsbDashboardController],
  providers: [OsbDashboardService, RolesGuard],
})
export class OsbDashboardModule {}
