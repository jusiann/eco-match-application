import { Module } from '@nestjs/common';
import { OsbsController } from './osbs.controller';
import { OsbsService } from './osbs.service';

@Module({
  controllers: [OsbsController],
  providers: [OsbsService],
})
export class OsbsModule {}
