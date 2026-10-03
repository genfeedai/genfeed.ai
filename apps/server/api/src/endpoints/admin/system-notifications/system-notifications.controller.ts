import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
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
  async createDestination(@Req() request: Request, @Body() body: unknown) {
    await this.destinations.save(body);
    return this.overview(request);
  }

  @Patch('destinations/:id')
  async updateDestination(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.destinations.save(body, id);
    return this.overview(request);
  }

  @Delete('destinations/:id')
  async removeDestination(@Req() request: Request, @Param('id') id: string) {
    await this.destinations.remove(id);
    return this.overview(request);
  }

  @Post('destinations/:id/test')
  @HttpCode(200)
  async testDestination(@Req() request: Request, @Param('id') id: string) {
    await this.destinations.test(id);
    return this.overview(request);
  }

  @Post('deliveries/:id/retry')
  @HttpCode(200)
  async retry(@Req() request: Request, @Param('id') id: string) {
    await this.events.retry(id);
    return this.overview(request);
  }
}
