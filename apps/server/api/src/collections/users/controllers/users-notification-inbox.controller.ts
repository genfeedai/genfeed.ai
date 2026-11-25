import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { NotificationInboxService } from '@api/services/notifications/inbox/notification-inbox.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import {
  NotificationInboxCountSerializer,
  NotificationInboxSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  ParseArrayPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('users/me/notification-inbox')
@UseGuards(RolesGuard)
export class UsersNotificationInboxController {
  constructor(private readonly inbox: NotificationInboxService) {}

  private assertOrganization(user: AuthenticatedUser, organizationId?: string) {
    if (organizationId && organizationId !== user.organizationId)
      throw new ForbiddenException('Organization context changed');
  }

  @Get()
  async list(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
    @Query('cursor') cursor?: string,
  ) {
    this.assertOrganization(user, organizationId);
    return serializeCollection(
      request,
      NotificationInboxSerializer,
      await this.inbox.list(
        user.organizationId,
        user.userId ?? user.id,
        cursor,
      ),
    );
  }

  @Get('unread-count')
  async count(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    this.assertOrganization(user, organizationId);
    return serializeSingle(
      request,
      NotificationInboxCountSerializer,
      await this.inbox.count(user.organizationId, user.userId ?? user.id),
    );
  }

  @Patch('read')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async read(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ParseArrayPipe({ items: String })) ids: string[],
    @Query('organizationId') organizationId?: string,
  ) {
    this.assertOrganization(user, organizationId);
    return serializeSingle(
      request,
      NotificationInboxCountSerializer,
      await this.inbox.markRead(
        user.organizationId,
        user.userId ?? user.id,
        ids,
      ),
    );
  }

  @Patch('read-all')
  @RequiredScopes(ApiKeyScope.ADMIN)
  async readAll(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Query('organizationId') organizationId?: string,
  ) {
    this.assertOrganization(user, organizationId);
    return serializeSingle(
      request,
      NotificationInboxCountSerializer,
      await this.inbox.markRead(
        user.organizationId,
        user.userId ?? user.id,
        null,
      ),
    );
  }
}
