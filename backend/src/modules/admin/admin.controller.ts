import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
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
  CreateWeightsDto,
  CreateApiKeyDto,
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

  // ── AHP Ağırlıkları (Faz 3.5, AD2) ──

  @Get('weights')
  listWeights() {
    return this.adminService.listWeights();
  }

  @Audit('create', 'weights_config')
  @Post('weights')
  createWeights(@Body() dto: CreateWeightsDto) {
    return this.adminService.createWeights(dto);
  }

  @Audit('activate', 'weights_config')
  @Post('weights/:id/activate')
  activateWeights(@Param('id') id: string) {
    return this.adminService.activateWeights(id);
  }

  // ── API Keys (Faz 3.6) ──

  @Get('api-keys')
  listApiKeys() {
    return this.adminService.listApiKeys();
  }

  @Audit('create', 'api_key')
  @Post('api-keys')
  createApiKey(@Body() dto: CreateApiKeyDto) {
    return this.adminService.createApiKey(dto);
  }

  @Audit('revoke', 'api_key')
  @Delete('api-keys/:id')
  revokeApiKey(@Param('id') id: string) {
    return this.adminService.revokeApiKey(id);
  }
}
