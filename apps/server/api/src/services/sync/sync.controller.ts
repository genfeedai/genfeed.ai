import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiresCloudAuth } from '@api/helpers/decorators/requires-cloud-auth.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { User } from '@clerk/backend';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('status')
  @RequiresCloudAuth()
  @LogMethod()
  async getStatus(@CurrentUser() user: User) {
    return this.syncService.getStatus(user);
  }

  @Post('workflows/push/:id')
  @RequiresCloudAuth()
  @LogMethod()
  async pushWorkflow(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const clerkToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
    return this.syncService.pushWorkflow(user, id, clerkToken);
  }

  @Post('workflows/pull/:cloudId')
  @RequiresCloudAuth()
  @LogMethod()
  async pullWorkflow(
    @CurrentUser() _user: User,
    @Param('cloudId') _cloudId: string,
  ) {
    throw new HttpException(
      'Pull workflow is not yet implemented',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
