import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import type { User } from '@clerk/backend';
import { AgentThreadSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Agent Threads')
@Controller('threads')
export class AgentThreadsController {
  constructor(
    private readonly agentThreadEngineService: AgentThreadEngineService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly usersService: UsersService,
    private readonly agentOrchestratorService: AgentOrchestratorService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get(':threadId/snapshot')
  @ApiOperation({ summary: 'Get the current projected thread snapshot' })
  async getSnapshot(
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const snapshot = await runEffectPromise(
        this.getThreadSnapshotEffect(threadId, organizationId),
      );
      return {
        activeRun: snapshot.activeRun ?? null,
        lastAssistantMessage: snapshot.lastAssistantMessage ?? null,
        lastSequence: snapshot.lastSequence,
        latestProposedPlan: snapshot.latestProposedPlan ?? null,
        latestUiBlocks: snapshot.latestUiBlocks ?? null,
        memorySummaryRefs: snapshot.memorySummaryRefs ?? [],
        pendingApprovals: snapshot.pendingApprovals ?? [],
        pendingInputRequests: snapshot.pendingInputRequests ?? [],
        profileSnapshot: snapshot.profileSnapshot ?? null,
        sessionBinding: snapshot.sessionBinding ?? null,
        source: snapshot.source ?? null,
        threadId,
        threadStatus: snapshot.threadStatus ?? null,
        timeline: snapshot.timeline ?? [],
        title: snapshot.title ?? null,
      };
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getThreadSnapshot',
      );
    }
  }

  @Get(':threadId/events')
  @ApiOperation({ summary: 'Get ordered persisted thread events' })
  async listEvents(
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
    @Query('afterSequence') afterSequence?: string,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const events = await runEffectPromise(
        this.listThreadEventsEffect(
          threadId,
          organizationId,
          afterSequence ? Number.parseInt(afterSequence, 10) : undefined,
        ),
      );

      return events.map((event) => ({
        commandId: event.commandId,
        eventId: event.eventId,
        metadata: event.metadata ?? {},
        occurredAt: event.occurredAt ?? null,
        payload: event.payload ?? {},
        runId: event.runId ?? null,
        sequence: event.sequence,
        threadId,
        type: event.type,
        userId: event.userId ?? null,
      }));
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'listThreadEvents',
      );
    }
  }

  @Post(':threadId/input-requests/:requestId/responses')
  @ApiOperation({ summary: 'Resolve a pending thread input request' })
  async respondToInputRequest(
    @Param('threadId') threadId: string,
    @Param('requestId') requestId: string,
    @Body() body: { answer: string },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveMongoUserId(user);
      const inputRequest = await runEffectPromise(
        this.resolveInputRequestEffect({
          answer: body.answer,
          organizationId,
          requestId,
          threadId,
          userId,
        }),
      );

      await this.agentOrchestratorService.resumeRecurringTaskDraftFromInput({
        answer: body.answer,
        fieldId: inputRequest.fieldId,
        organizationId,
        runId: inputRequest.runId,
        threadId,
        userId,
      });

      return {
        answer: inputRequest.answer ?? null,
        fieldId: inputRequest.fieldId ?? null,
        requestId: inputRequest.requestId,
        resolvedAt: inputRequest.resolvedAt ?? null,
        status: inputRequest.status,
        threadId,
      };
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'respondToThreadInputRequest',
      );
    }
  }

  @Post(':threadId/ui-actions')
  @ApiOperation({ summary: 'Execute a thread UI action' })
  async respondToUiAction(
    @Param('threadId') threadId: string,
    @Body() body: { action: string; payload?: Record<string, unknown> },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveMongoUserId(user);

      return await this.agentOrchestratorService.handleThreadUiAction(
        {
          action: body.action,
          payload: body.payload,
          threadId,
        },
        {
          organizationId,
          userId,
        },
      );
    } catch (error: unknown) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'respondToUiAction',
      );
    }
  }

  @Post(':threadId/branches')
  @ApiOperation({ summary: 'Branch an existing thread' })
  async branchThread(
    @Req() request: Request,
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveMongoUserId(user);
      await this.flushThreadMemory(threadId, organizationId, userId, 'branch');
      const branched = await this.agentThreadsService.branchThread(
        threadId,
        organizationId,
        userId,
      );
      return serializeSingle(request, AgentThreadSerializer, branched);
    } catch (error: unknown) {
      return ErrorResponse.handle(error, this.loggerService, 'branchThread');
    }
  }

  private async flushThreadMemory(
    threadId: string,
    organizationId: string,
    userId: string,
    reason: 'archive' | 'branch',
  ): Promise<void> {
    const recentMessages = await this.agentMessagesService.getMessagesByRoom(
      threadId,
      organizationId,
      { limit: 12, page: 1 },
    );
    const summary = recentMessages
      .slice()
      .reverse()
      .filter(
        (message) => message.role === 'user' || message.role === 'assistant',
      )
      .map((message) => `${message.role}: ${message.content ?? ''}`.trim())
      .filter((line) => line.length > 0)
      .join('\n')
      .slice(0, 4000);

    if (!summary) {
      return;
    }

    await this.recordThreadMemoryFlush(
      threadId,
      organizationId,
      userId,
      summary,
      ['agent-thread', reason],
    );
  }

  private getThreadSnapshotEffect(threadId: string, organizationId: string) {
    return this.agentThreadEngineService.getSnapshotEffect(
      threadId,
      organizationId,
    );
  }

  private listThreadEventsEffect(
    threadId: string,
    organizationId: string,
    afterSequence?: number,
  ) {
    return this.agentThreadEngineService.listEventsEffect(
      threadId,
      organizationId,
      afterSequence,
    );
  }

  private resolveInputRequestEffect(params: {
    threadId: string;
    organizationId: string;
    requestId: string;
    answer: string;
    userId: string;
  }) {
    return this.agentThreadEngineService.resolveInputRequestEffect(params);
  }

  private async recordThreadMemoryFlush(
    threadId: string,
    organizationId: string,
    userId: string,
    content: string,
    tags: string[],
  ): Promise<void> {
    await runEffectPromise(
      this.agentThreadEngineService.recordMemoryFlushEffect(
        threadId,
        organizationId,
        userId,
        content,
        tags,
      ),
    );
  }

  private resolveOrganizationId(user: User): string {
    const { organization } = getPublicMetadata(user);
    if (!ObjectIdUtil.isValid(organization)) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }
    return organization;
  }

  private async resolveMongoUserId(user: User): Promise<string> {
    const clerkId = user.id;
    if (!clerkId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const { user: metadataUserId } = getPublicMetadata(user);
    if (ObjectIdUtil.isValid(metadataUserId)) {
      const metadataUserDoc = await this.usersService.findOne(
        { _id: metadataUserId, clerkId },
        [],
      );
      if (metadataUserDoc?._id) {
        return String(metadataUserDoc._id);
      }
    }

    const dbUser = await this.usersService.findOne({ clerkId }, []);
    if (!dbUser?._id) {
      throw new UnauthorizedException('User account not found');
    }

    return String(dbUser._id);
  }
}
