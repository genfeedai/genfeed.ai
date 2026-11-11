import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AppendExternalAgentTurnDto } from '@api/collections/agent-threads/dto/append-external-agent-turn.dto';
import { AgentThreadAccessService } from '@api/collections/agent-threads/services/agent-thread-access.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { buildAgentThreadActor } from '@api/collections/agent-threads/utils/agent-thread-actor.util';
import { withAgentThreadExternalRuntime } from '@api/collections/agent-threads/utils/agent-thread-external-runtime.util';
import {
  resolveAgentThreadDatabaseUserId,
  resolveAgentThreadOrganizationId,
} from '@api/collections/agent-threads/utils/agent-thread-identity.util';
import { UsersService } from '@api/collections/users/services/users.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { scopedWhere } from '@api/index';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  AgentMessageRole,
  AgentThreadAccessLevel,
  AgentThreadStatus,
} from '@genfeedai/contracts';
import {
  AgentThreadSerializer,
  ThreadMessageSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** Writes to a thread: a message from the user, or a turn run on their own CLI. */
@ApiTags('Agent Threads')
@FeatureFlag('agent')
@Controller('agent/threads/:threadId')
export class AgentThreadTurnsController {
  constructor(
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentThreadAccessService: AgentThreadAccessService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly usersService: UsersService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('messages')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({ summary: 'Add a message to a thread' })
  async addMessage(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: { content: string; role?: string },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = resolveAgentThreadOrganizationId(user);
      const dbUserId = await resolveAgentThreadDatabaseUserId(
        user,
        this.usersService,
      );
      const access = await this.agentThreadAccessService.assertAccess(
        buildAgentThreadActor(user, organizationId, dbUserId),
        threadId,
        'collaborate',
      );
      const thread = await this.agentThreadsService.findOne(
        scopedWhere(organizationId, {
          id: threadId,
          isDeleted: false,
        }),
      );
      const status = String(
        (thread as { status?: string | null } | null)?.status ?? '',
      ).toLowerCase();
      if (status === AgentThreadStatus.ARCHIVED || status === 'archived') {
        throw new BadRequestException(
          'This thread is archived. Unarchive it before sending messages or running actions.',
        );
      }
      const message = await this.agentMessagesService.addMessage({
        content: body.content,
        organizationId,
        // A collaborator writes as the user; only the owner may set a role.
        role:
          access.accessLevel === AgentThreadAccessLevel.OWNER
            ? (body.role as AgentMessageRole) || AgentMessageRole.USER
            : AgentMessageRole.USER,
        room: threadId,
        userId: dbUserId,
      });

      return serializeSingle(req, ThreadMessageSerializer, message);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'addMessage');
    }
  }

  @Post('external-turns')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      "Append a turn that ran on the user's own Claude Code / Codex CLI subscription (never billed in Genfeed credits)",
  })
  async appendExternalTurn(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: AppendExternalAgentTurnDto,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = resolveAgentThreadOrganizationId(user);
      const userId = await resolveAgentThreadDatabaseUserId(
        user,
        this.usersService,
      );
      const { thread } = await this.agentThreadsService.appendExternalTurn(
        threadId,
        organizationId,
        userId,
        body,
      );

      return serializeSingle(
        req,
        AgentThreadSerializer,
        withAgentThreadExternalRuntime(thread),
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'appendExternalTurn',
      );
    }
  }
}
