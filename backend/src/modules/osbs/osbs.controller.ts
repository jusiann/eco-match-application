import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OsbsService } from './osbs.service';

@Controller('osbs')
export class OsbsController {
  constructor(private readonly osbsService: OsbsService) {}

  @Throttle({ default: { limit: 100, ttl: 60 * 1000 } }) // docs/04: public, 100/dk, IP
  @Get()
  list() {
    return this.osbsService.list();
  }
}
