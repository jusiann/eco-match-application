import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiClientService } from './ai-client.service';
import { SystemConfigService } from '../../common/services/system-config.service';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, AiClientService, SystemConfigService],
  exports: [AiClientService],
})
export class AiModule {}
