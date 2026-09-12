import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { NotificationsService } from './notifications.service';
import { ListNotificationsQueryDto, UpdatePrefsBody } from './notifications.dto';

// bkz. health.controller.ts başındaki not -- global 'chat-daily' (50/gün) bütçesinden muaf.
@SkipThrottle({ 'chat-daily': true })
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@GetUser() user: { sub: string }, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.list(user.sub, query);
  }

  @Get('unread-count')
  async unreadCount(@GetUser() user: { sub: string }) {
    return { count: await this.notificationsService.unreadCount(user.sub) };
  }

  @Get('prefs')
  getPrefs(@GetUser() user: { sub: string }) {
    return this.notificationsService.getPrefs(user.sub);
  }

  @Patch('prefs')
  updatePrefs(@GetUser() user: { sub: string }, @Body() body: UpdatePrefsBody) {
    return this.notificationsService.updatePrefs(user.sub, body);
  }

  @Patch('read-all')
  markAllRead(@GetUser() user: { sub: string }) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Patch(':id/read')
  markRead(@GetUser() user: { sub: string }, @Param('id') id: string) {
    return this.notificationsService.markRead(user.sub, id);
  }
}
