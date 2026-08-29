import { Controller, Get } from '@nestjs/common';
import { OsbsService } from './osbs.service';

@Controller('osbs')
export class OsbsController {
  constructor(private readonly osbsService: OsbsService) {}

  @Get()
  list() {
    return this.osbsService.list();
  }
}
