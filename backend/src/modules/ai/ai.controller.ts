import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { ClassifyDto } from './ai.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } }) // docs/04: 60/dk, kullanıcı (debounce ile birlikte)
  @Post('classify')
  classify(@Body() dto: ClassifyDto) {
    return this.aiService.classify(dto.description);
  }
}
