import { Controller, Get, Post, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Idempotent } from '../../common/decorators/idempotent.decorator';
import { MatchesService } from './matches.service';
import { RejectMatchDto, MatchListQueryDto } from './matches.dto';

// list/get/accept/reject/retry/contact hiçbirinin kendi @Throttle'ı yok -- bkz.
// health.controller.ts başındaki not. `find`'ın kendi method-level @Throttle'ı
// yalnızca 'default' kullandığı için bu class-level muafiyetten etkilenmez.
@SkipThrottle({ 'chat-daily': true })
@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } }) // docs/04: 30/dk, kullanıcı
  @Get('find/:outputId')
  async find(@GetUser() user: { sub: string }, @Param('outputId') outputId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.matchesService.findCandidates(user.sub, outputId);
    if ('error' in result && result.error === 'PENDING_EXPERT_REVIEW') {
      reply.status(202);
    }
    return result;
  }

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

  @Audit('create', 'match')
  @Idempotent()
  @Post(':id/retry')
  retry(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.matchesService.retry(user.sub, id);
  }
}
