import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateAgentThreadShareDto } from '@api/collections/agent-threads/dto/create-agent-thread-share.dto';
import { AgentThreadSharesService } from '@api/collections/agent-threads/services/agent-thread-shares.service';
import {
  buildAgentThreadActor,
  resolveAgentThreadReadOrganizationId,
} from '@api/collections/agent-threads/utils/agent-thread-actor.util';
import {
  resolveAgentThreadDatabaseUserId,
  resolveAgentThreadOrganizationId,
} from '@api/collections/agent-threads/utils/agent-thread-identity.util';
import { UsersService } from '@api/collections/users/services/users.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { AgentThreadShareSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** Who a thread is shared with. Only its owner or an organization admin manages it. */
@ApiTags('Agent Threads')
@FeatureFlag('agent')
@Controller('agent/threads/:threadId/shares')
export class AgentThreadSharesController {
  constructor(
    private readonly agentThreadSharesService: AgentThreadSharesService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List who a thread is shared with' })
  async listShares(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const shares = await this.agentThreadSharesService.list(
        await this.actorFor(
          user,
          resolveAgentThreadReadOrganizationId(req, user),
        ),
        threadId,
      );
      return serializeCollection(req, AgentThreadShareSerializer, {
        docs: shares,
      });
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'listShares');
    }
  }

  @Post()
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary: 'Share a thread with a member, a brand or the organization',
  })
  async createShare(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: CreateAgentThreadShareDto,
    @CurrentUser() user: User,
  ) {
    try {
      const share = await this.agentThreadSharesService.grant(
        await this.actorFor(user, resolveAgentThreadOrganizationId(user)),
        threadId,
        body,
      );
      return serializeSingle(req, AgentThreadShareSerializer, share);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'createShare');
    }
  }

  @Delete(':shareId')
  @ApiOperation({ summary: 'Stop sharing a thread with one target' })
  async deleteShare(
    @Param('threadId') threadId: string,
    @Param('shareId') shareId: string,
    @CurrentUser() user: User,
  ) {
    try {
      await this.agentThreadSharesService.revoke(
        await this.actorFor(user, resolveAgentThreadOrganizationId(user)),
        threadId,
        shareId,
      );
      return { deleted: true };
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'deleteShare');
    }
  }

  private async actorFor(user: User, organizationId: string) {
    return buildAgentThreadActor(
      user,
      organizationId,
      await resolveAgentThreadDatabaseUserId(user, this.usersService),
    );
  }
}
