import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { ScoringService } from './scoring.service';
import { SystemConfigService } from '../../common/services/system-config.service';

@Module({
  imports: [AuthModule],
  controllers: [MatchesController],
  providers: [MatchesService, ScoringService, SystemConfigService],
})
export class MatchmakingModule {}
