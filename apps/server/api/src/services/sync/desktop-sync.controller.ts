import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiresCloudAuth } from '@api/helpers/decorators/requires-cloud-auth.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { User } from '@clerk/backend';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { DesktopSyncService } from './desktop-sync.service';
import { PushDesktopThreadsDto } from './dto/push-desktop-threads.dto';

@Controller('sync/desktop')
export class DesktopSyncController {
  constructor(private readonly desktopSyncService: DesktopSyncService) {}

  @Get('threads')
  @RequiresCloudAuth()
  @LogMethod()
  async pullThreads(
    @CurrentUser() user: User,
    @Query('cursor') cursor?: string,
  ) {
    return this.desktopSyncService.pullThreads(user, cursor);
  }

  @Post('threads')
  @RequiresCloudAuth()
  @LogMethod()
  async pushThreads(
    @CurrentUser() user: User,
    @Body() body: PushDesktopThreadsDto,
  ) {
    return this.desktopSyncService.pushThreads(user, body);
  }
}
