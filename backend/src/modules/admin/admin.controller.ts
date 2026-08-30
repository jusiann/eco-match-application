import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AdminService } from './admin.service';
import {
  RejectVerificationDto,
  CreateCarbonFactorDto,
  CreateUserDto,
  UpdateUserDto,
  ListQueryDto,
  AuditLogQueryDto,
  UpdateConfigBody,
} from './admin.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('verifications')
  listVerifications() {
    return this.adminService.listPendingVerifications();
  }

  @Audit('update', 'facility_verification')
  @Post('verifications/:id/approve')
  approve(@Param('id') id: string, @GetUser() user: { sub: string }) {
    return this.adminService.approveVerification(id, user.sub);
  }

  @Audit('update', 'facility_verification')
  @Post('verifications/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectVerificationDto, @GetUser() user: { sub: string }) {
    return this.adminService.rejectVerification(id, user.sub, dto.reason);
  }

  @Get('carbon-factors')
  listCarbonFactors() {
    return this.adminService.listCarbonFactors();
  }

  @Audit('create', 'carbon_factor')
  @Post('carbon-factors')
  createCarbonFactor(@Body() dto: CreateCarbonFactorDto) {
    return this.adminService.createCarbonFactor(dto);
  }

  @Get('users')
  listUsers(@Query() query: ListQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Audit('create', 'user')
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Audit('update', 'user')
  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Get('config')
  getConfig() {
    return this.adminService.getConfig();
  }

  @Audit('update', 'system_config')
  @Patch('config')
  updateConfig(@GetUser() user: { sub: string }, @Body() body: UpdateConfigBody) {
    return this.adminService.updateConfig(user.sub, body);
  }

  @Get('audit-log')
  listAuditLog(@Query() query: AuditLogQueryDto) {
    return this.adminService.listAuditLog(query);
  }
}
