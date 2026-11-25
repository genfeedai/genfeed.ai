import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import { SystemNotificationOverviewSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('admin/system-notifications')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminSystemNotificationsController {
  constructor(
    private readonly events: SystemEventsService,
    private readonly destinations: SystemNotificationDestinationsService,
  ) {}
  @Get()
  async overview(@Req() request: Request) {
    return serializeSingle(
      request,
      SystemNotificationOverviewSerializer,
      await this.events.overview(),
    );
  }
  @Patch()
  async configure(@Req() request: Request, @Body() body: unknown) {
    await this.events.configure(body);
    return this.overview(request);
  }
  @Post('destinations')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async createDestination(@Req() request: Request, @Body() body: unknown) {
    await this.destinations.save(body);
    return this.overview(request);
  }

  @Patch('destinations/:id')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async updateDestination(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.destinations.save(body, id);
    return this.overview(request);
  }

  @Delete('destinations/:id')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async removeDestination(@Req() request: Request, @Param('id') id: string) {
    await this.destinations.remove(id);
    return this.overview(request);
  }

  @Post('destinations/:id/test')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @HttpCode(200)
  async testDestination(@Req() request: Request, @Param('id') id: string) {
    await this.destinations.test(id);
    return this.overview(request);
  }

  @Post('discord-channels/:channel/test')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @HttpCode(200)
  async testDiscordChannel(
    @Req() request: Request,
    @Param('channel') channel: string,
  ) {
    await this.destinations.testDiscordChannel(channel);
    return this.overview(request);
  }

  @Post('deliveries/:id/retry')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @HttpCode(200)
  async retry(@Req() request: Request, @Param('id') id: string) {
    await this.events.retry(id);
    return this.overview(request);
  }
}
