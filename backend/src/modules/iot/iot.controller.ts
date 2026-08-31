import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { GetApiKeyUser } from '../../common/decorators/get-api-key-user.decorator';
import { IotService } from './iot.service';
import { SensorReadingDto } from './iot.dto';

// docs/03: api_key JWT değil, ayrı bir kimlik doğrulama yöntemi -- bu yüzden JwtAuthGuard
// yerine ApiKeyGuard var, /v1 prefix'i (main.ts setGlobalPrefix) diğer tüm modüllerle aynı.
@UseGuards(ApiKeyGuard)
@Controller('iot')
export class IotController {
  constructor(private readonly iotService: IotService) {}

  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } }) // 5 dk'da bir yayınlayan bir sensör için bolca pay
  @Post('sensor-data')
  ingest(@GetApiKeyUser() apiKeyUser: { userId: string; facilityId: string }, @Body() dto: SensorReadingDto) {
    return this.iotService.ingest(apiKeyUser.facilityId, dto);
  }
}
