import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiresCloudAuth } from '@api/helpers/decorators/requires-cloud-auth.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { parseAuthorizationHeader } from '@libs/auth/authorization-header';
import { Controller, Get, Param, Post, Req } from '@nestjs/common';
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
    return this.syncService.pushWorkflow(
      user,
      id,
      this.extractAuthProviderToken(req),
    );
  }

  @Post('workflows/pull/:cloudId')
  @RequiresCloudAuth()
  @LogMethod()
  async pullWorkflow(
    @CurrentUser() user: User,
    @Param('cloudId') cloudId: string,
    @Req() req: Request,
  ) {
    return this.syncService.pullWorkflow(
      user,
      cloudId,
      this.extractAuthProviderToken(req),
    );
  }

  /**
   * `SyncService` re-emits this as `Authorization: Bearer <token>` when it
   * calls the cloud API, so this must resolve to a bare token — never the
   * scheme. The previous `authorization?.replace('Bearer ', '')` was a
   * case-sensitive literal match: a client sending `bearer <tok>` (RFC 7235
   * scheme names are case-insensitive) left the whole string un-stripped,
   * which `SyncService` then forwarded as `Authorization: Bearer bearer
   * <tok>` — see https://github.com/genfeedai/genfeed.ai/issues/5206.
   */
  private extractAuthProviderToken(req: Request): string {
    const parsed = parseAuthorizationHeader(req.headers.authorization);
    return parsed?.normalizedScheme === 'bearer' ? parsed.token : '';
  }
}
