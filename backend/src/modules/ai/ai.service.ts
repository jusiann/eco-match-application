import { Injectable } from '@nestjs/common';
import { SystemConfigService } from '../../common/services/system-config.service';
import { AiClientService } from './ai-client.service';

@Injectable()
export class AiService {
  constructor(
    private readonly aiClient: AiClientService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async classify(description: string) {
    const result = await this.aiClient.classify(description);

    // docs/07: AI servisi kendi requires_human_review bayrağını hesaplasa da backend
    // eşiği kendi kontrol eder -- tek kaynağa güvenmiyoruz, otorite system_config'te
    const hitlThreshold = await this.systemConfig.getNumber('match.hitl_threshold', 0.8);

    return {
      materialClass: result.materialClass,
      confidence: result.confidence,
      top3: result.top3,
      requiresHumanReview: result.confidence < hitlThreshold,
    };
  }
}
