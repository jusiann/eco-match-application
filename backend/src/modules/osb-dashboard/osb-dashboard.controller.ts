import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { OsbDashboardService } from './osb-dashboard.service';
import { OsbFacilitiesQueryDto, OsbMonthlyReportQueryDto } from './osb-dashboard.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OSB_MANAGER)
@Controller('osb')
export class OsbDashboardController {
  constructor(private readonly osbDashboardService: OsbDashboardService) {}

  @Get('stats')
  stats(@GetUser() user: { sub: string }) {
    return this.osbDashboardService.stats(user.sub);
  }

  @Get('facilities')
  facilities(@GetUser() user: { sub: string }, @Query() query: OsbFacilitiesQueryDto) {
    return this.osbDashboardService.facilities(user.sub, query);
  }

  @Get('map')
  map(@GetUser() user: { sub: string }) {
    return this.osbDashboardService.map(user.sub);
  }

  @Get('reports/monthly')
  async monthlyReport(
    @GetUser() user: { sub: string },
    @Query() query: OsbMonthlyReportQueryDto,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.osbDashboardService.monthlyReport(user.sub, query.period, query.format);
    if (result.pdfBuffer) {
      reply.type('application/pdf').send(result.pdfBuffer);
    } else if (result.xlsxBuffer) {
      reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(result.xlsxBuffer);
    } else {
      reply.type('application/json').send(result.summary);
    }
  }
}
