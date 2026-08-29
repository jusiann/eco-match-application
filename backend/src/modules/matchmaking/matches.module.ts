import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [AuthModule],
  controllers: [MatchesController],
  providers: [MatchesService],
})
export class MatchmakingModule {}
