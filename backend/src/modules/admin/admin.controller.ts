import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AdminService } from './admin.service';
import { RejectVerificationDto } from './admin.dto';

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
}
