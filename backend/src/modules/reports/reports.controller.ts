import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ReportsService } from './reports.service';
import { ReportFormatQueryDto, ListReportsQueryDto } from './reports.dto';

// bkz. health.controller.ts başındaki not -- global 'chat-daily' (50/gün) bütçesinden muaf.
@SkipThrottle({ 'chat-daily': true })
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('environmental/:matchId')
  async environmental(
    @GetUser() user: { sub: string },
    @Param('matchId') matchId: string,
    @Query() query: ReportFormatQueryDto,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.reportsService.generateEnvironmental(user.sub, matchId, query.format ?? 'json');
    if (result.pdfBuffer) {
      reply.type('application/pdf').send(result.pdfBuffer);
    } else {
      reply.type('application/json').send(result.data);
    }
  }

  @Get('cbam/:matchId')
  async cbam(
    @GetUser() user: { sub: string },
    @Param('matchId') matchId: string,
    @Query() query: ReportFormatQueryDto,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.reportsService.generateCbam(user.sub, matchId, query.format ?? 'json');
    if (result.pdfBuffer) {
      reply.type('application/pdf').send(result.pdfBuffer);
    } else {
      reply.type('application/json').send(result.data);
    }
  }

  @Get('dpp/:passportId')
  getDppReport(@GetUser() user: { sub: string }, @Param('passportId') passportId: string) {
    return this.reportsService.getDppReport(user.sub, passportId);
  }

  @Get()
  list(@GetUser() user: { sub: string }, @Query() query: ListReportsQueryDto) {
    return this.reportsService.list(user.sub, query);
  }
}
