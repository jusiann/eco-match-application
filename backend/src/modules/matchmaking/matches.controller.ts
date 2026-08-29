import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { MatchesService } from './matches.service';
import { RejectMatchDto, MatchListQueryDto } from './matches.dto';

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  list(@GetUser() user: { sub: string }, @Query() query: MatchListQueryDto) {
    return this.matchesService.listMatches(user.sub, query);
  }

  @Get(':id')
  get(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.matchesService.getMatch(user.sub, id);
  }

  @Audit('update', 'match')
  @Idempotent()
  @Post(':id/accept')
  accept(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.matchesService.accept(user.sub, id);
  }

  @Audit('update', 'match')
  @Idempotent()
  @Post(':id/reject')
  reject(@GetUser() user: { sub: string }, @Param('id') id: string, @Body() dto: RejectMatchDto) {
    return this.matchesService.reject(user.sub, id, dto);
  }

  @Get(':id/contact')
  contact(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.matchesService.getContact(user.sub, id);
  }
}
