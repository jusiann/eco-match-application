import { Controller, Get, Patch, Post, Body, UseGuards, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { FacilitiesService } from './facilities.service';
import { UpdateFacilityDto } from './facilities.dto';

// bkz. health.controller.ts başındaki not -- bu route'lar açıkça @Throttle ile bir isim
// kümesi seçmediği için global 'chat-daily' (50/gün) bütçesini paylaşıyordu.
@SkipThrottle({ 'chat-daily': true })
@UseGuards(JwtAuthGuard)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get('me')
  getMe(@GetUser() user: { sub: string }) {
    return this.facilitiesService.getMe(user.sub);
  }

  @Audit('update', 'facility')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FACILITY_ADMIN)
  @Patch('me')
  updateMe(@GetUser() user: { sub: string }, @Body() dto: UpdateFacilityDto) {
    return this.facilitiesService.updateMe(user.sub, dto);
  }

  @Audit('create', 'facility_verification')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FACILITY_ADMIN)
  @Post('me/documents')
  uploadDocument(@GetUser() user: { sub: string }, @Req() request: FastifyRequest) {
    return this.facilitiesService.uploadDocument(user.sub, request);
  }

  @Get('me/documents')
  listDocuments(@GetUser() user: { sub: string }) {
    return this.facilitiesService.listDocuments(user.sub);
  }
}
