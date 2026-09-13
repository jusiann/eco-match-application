import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { MaterialsModule } from '../materials/materials.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { ScoringService } from './scoring.service';
import { SystemConfigService } from '../../common/services/system-config.service';

@Module({
  imports: [AuthModule, AiModule, MaterialsModule],
  controllers: [MatchesController],
  providers: [MatchesService, ScoringService, SystemConfigService],
})
export class MatchmakingModule {}
