import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkspaceInboxReadDto } from '@api/collections/tasks/dto/workspace-inbox-read.dto';
import { WorkspaceInboxReadService } from '@api/collections/tasks/services/workspace-inbox-read.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { WorkspaceInboxReadSerializer } from '@genfeedai/serializers';
import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('tasks/inbox')
export class WorkspaceInboxReadController {
  constructor(private readonly inbox: WorkspaceInboxReadService) {}

  @Get('read-state')
  async list(@Req() request: Request, @CurrentUser() user: AuthenticatedUser) {
    return serializeSingle(
      request,
      WorkspaceInboxReadSerializer,
      await this.inbox.list(user.organizationId, user.userId ?? user.id),
    );
  }

  @Patch('read-state')
  async read(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: WorkspaceInboxReadDto,
  ) {
    return serializeSingle(
      request,
      WorkspaceInboxReadSerializer,
      await this.inbox.markRead(
        user.organizationId,
        user.userId ?? user.id,
        body.reads,
      ),
    );
  }

  @Patch('read-all')
  async readAll(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return serializeSingle(
      request,
      WorkspaceInboxReadSerializer,
      await this.inbox.markAllRead(user.organizationId, user.userId ?? user.id),
    );
  }
}
