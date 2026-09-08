import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { AgentScopeContextService } from '@api/index';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentWorkObjectService } from '@api/services/agent-orchestrator/tools/agent-work-object.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import type { AgentWorkObjectActionPayload } from '@genfeedai/contracts/interfaces';
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
@Controller('agent/threads')
export class AgentThreadRuntimeController {
  constructor(
    private readonly agentThreadEngineService: AgentThreadEngineService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly usersService: UsersService,
    private readonly agentOrchestratorService: AgentOrchestratorService,
    private readonly loggerService: LoggerService,
    private readonly workObjects: AgentWorkObjectService,
  ) {}

  @Get(':threadId/snapshot')
  @ApiOperation({ summary: 'Get the current projected thread snapshot' })
  async getSnapshot(
    @Param('threadId') threadId: string,
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveDatabaseUserId(user);
      const snapshot = await this.agentThreadEngineService.getSnapshot(
        threadId,
        organizationId,
        userId,
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

  @Get(':threadId/work-objects')
  async getWorkObjects(
    @Param('threadId') threadId: string,
    @Query('sessionId') sessionId: string,
    @CurrentUser() user: User,
  ) {
    const scope = await this.workScope(threadId, user);
    return this.workObjects.list(scope, sessionId);
  }

  @Post(':threadId/work-objects/:objectId/actions')
  async actOnWorkObject(
    @Param('threadId') threadId: string,
    @Param('objectId') objectId: string,
    @Body() body: AgentWorkObjectActionPayload,
    @CurrentUser() user: User,
  ) {
    const scope = await this.workScope(threadId, user, body);
    const token = await this.workObjects.action(scope, objectId, body);
    if (token) {
      try {
        const queued = await this.agentOrchestratorService.handleThreadUiAction(
          {
            action: 'review_work_object',
            threadId,
            brandId: scope.brandId,
            expectedContextVersion: body.expectedContextVersion,
            payload: { objectId, reviewToken: token },
          },
          { organizationId: scope.organizationId, userId: scope.userId },
        );
        await this.workObjects.linkReviewExecution(
          scope,
          objectId,
          token,
          queued.executionId,
        );
      } catch (error) {
        await this.workObjects.action(scope, objectId, {
          ...body,
          action: 'cancel',
        });
        throw error;
      }
    }
    return this.workObjects.list(scope, body.sessionId);
  }

  private async workScope(
    threadId: string,
    user: User,
    body?: AgentWorkObjectActionPayload,
  ) {
    const organizationId = this.resolveOrganizationId(user);
    const userId = await this.resolveDatabaseUserId(user);
    const prepared = await this.agentScopeContextService.prepareForTurn({
      threadId,
      organizationId,
      userId,
      ...(body
        ? {
            expectedContextVersion: body.expectedContextVersion,
            requestedBrandId: body.brandId,
          }
        : {}),
    });
    if (!prepared.existingScope)
      throw new UnauthorizedException('Thread scope is unavailable.');
    if (body)
      await this.agentScopeContextService.assertConsequentialBoundary(
        prepared.existingScope,
        'tool',
      );
    return {
      threadId,
      organizationId,
      userId,
      brandId: prepared.existingScope.brandId,
    };
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
      const userId = await this.resolveDatabaseUserId(user);
      const events = await this.agentThreadEngineService.listEvents(
        threadId,
        organizationId,
        afterSequence ? Number.parseInt(afterSequence, 10) : undefined,
        userId,
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
    @Body()
    body: {
      answer: string;
      brandId?: string | null;
      expectedContextVersion?: number;
    },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveDatabaseUserId(user);
      const preparedScope = await this.agentScopeContextService.prepareForTurn({
        expectedContextVersion: body.expectedContextVersion,
        organizationId,
        requestedBrandId: body.brandId,
        threadId,
        userId,
      });
      const scope = preparedScope.existingScope;
      if (!scope) {
        throw new UnauthorizedException('Agent thread scope is unavailable.');
      }
      await this.agentScopeContextService.assertConsequentialBoundary(
        scope,
        'workflow',
      );
      const inputRequest =
        await this.agentThreadEngineService.resolveInputRequest({
          answer: body.answer,
          brandId: scope.brandId,
          contextVersion: scope.contextVersion,
          organizationId,
          requestId,
          threadId,
          userId,
        });

      if (requestId.startsWith('recurring-workflow:')) {
        await this.agentOrchestratorService.resumeRecurringTaskDraftFromInput({
          answer: body.answer,
          fieldId:
            typeof inputRequest.fieldId === 'string'
              ? inputRequest.fieldId
              : undefined,
          organizationId,
          threadId,
          userId,
          scope,
        });
      } else {
        await this.agentOrchestratorService.acceptChatStream(
          {
            threadId,
            content: body.answer,
            clientRequestId: `input-response:${requestId}`,
            brandId: scope.brandId,
            expectedContextVersion: scope.contextVersion,
            hostSupportsApproval: true,
          },
          { organizationId, userId },
        );
      }

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
    @Body()
    body: {
      action: string;
      brandId?: string | null;
      expectedContextVersion?: number;
      payload?: Record<string, unknown>;
    },
    @CurrentUser() user: User,
  ) {
    try {
      const organizationId = this.resolveOrganizationId(user);
      const userId = await this.resolveDatabaseUserId(user);

      return await this.agentOrchestratorService.handleThreadUiAction(
        {
          action: body.action,
          brandId: body.brandId,
          expectedContextVersion: body.expectedContextVersion,
          payload: body.payload,
          threadId,
        },
        {
          apiKeyContext: user,
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
      const userId = await this.resolveDatabaseUserId(user);
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

  private async recordThreadMemoryFlush(
    threadId: string,
    organizationId: string,
    userId: string,
    content: string,
    tags: string[],
  ): Promise<void> {
    await this.agentThreadEngineService.recordMemoryFlush(
      threadId,
      organizationId,
      userId,
      content,
      tags,
    );
  }

  private resolveOrganizationId(user: User): string {
    const organization = user.organizationId;
    if (!organization) {
      throw new UnauthorizedException(
        'Invalid organization context. Please sign in again.',
      );
    }
    return organization;
  }

  private async resolveDatabaseUserId(user: User): Promise<string> {
    const metadataUserId = user.userId ?? user.id;
    if (metadataUserId) {
      return metadataUserId;
    }

    const userId = user.id;
    if (!userId) {
      throw new UnauthorizedException(
        'Missing user identity. Please sign in again.',
      );
    }

    const dbUser = await this.usersService.findOne({ id: userId }, []);
    if (!dbUser?.id) {
      throw new UnauthorizedException('User account not found');
    }

    return String(dbUser.id);
  }
}
