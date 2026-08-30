import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ReviewQueueService } from './review-queue.service';
import { ApproveReviewDto, RejectReviewDto, ReviewQueueListQueryDto } from './review-queue.dto';

// docs/04: review-queue endpoint'lerine admin dışında expert de erişir -- bu yüzden
// admin.controller.ts'in @Roles(ADMIN) kapsamına girmiyor, ayrı bir controller
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.EXPERT)
@Controller('admin/review-queue')
export class ReviewQueueController {
  constructor(private readonly reviewQueueService: ReviewQueueService) {}

  @Get()
  list(@Query() query: ReviewQueueListQueryDto) {
    return this.reviewQueueService.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.reviewQueueService.detail(id);
  }

  @Audit('update', 'human_review_queue')
  @Post(':id/approve')
  approve(@GetUser() user: { sub: string }, @Param('id') id: string, @Body() dto: ApproveReviewDto) {
    return this.reviewQueueService.approve(id, user.sub, dto);
  }

  @Audit('update', 'human_review_queue')
  @Post(':id/reject')
  reject(@GetUser() user: { sub: string }, @Param('id') id: string, @Body() dto: RejectReviewDto) {
    return this.reviewQueueService.reject(id, user.sub, dto);
  }
}
