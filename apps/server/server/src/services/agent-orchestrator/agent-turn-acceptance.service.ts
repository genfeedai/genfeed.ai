import { createHash } from 'node:crypto';
import { AgentThreadStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { AgentScopeContextService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentTurnAcknowledgement,
} from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

const AGENT_TURN_WORKFLOW_ID = 'agent.turn.execute';
const ARCHIVED_THREAD_WRITE_ERROR =
  'This thread is archived. Unarchive it before sending messages or running actions.';

function stableUuid(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join('\u001f')).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

@Injectable()
export class AgentTurnAcceptanceService {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly scopeService: AgentScopeContextService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  async accept(
    request: AgentChatRequest & { clientRequestId: string },
    context: AgentChatContext,
  ): Promise<AgentTurnAcknowledgement> {
    const preparedScope = await this.scopeService.prepareForTurn({
      expectedContextVersion: request.expectedContextVersion,
      organizationId: context.organizationId,
      requestedBrandId: request.brandId,
      threadId: request.threadId,
      userId: context.userId,
    });
    const threadId =
      preparedScope.existingScope?.threadId ??
      stableUuid(
        'agent-turn-thread',
        context.organizationId,
        context.userId,
        request.clientRequestId,
      );
    const thread = preparedScope.existingScope
      ? await this.loadThread(threadId, context)
      : await this.createThread(threadId, request, context, preparedScope);
    const contextVersion = Number(thread.contextVersion ?? 1);
    const contextId = `${threadId}:v${contextVersion}`;
    const queuedAt = new Date().toISOString();
    const { executionId } = await this.workflowRunner.enqueueWorkflow({
      actionType: AGENT_TURN_WORKFLOW_ID,
      canonicalId: AGENT_TURN_WORKFLOW_ID,
      idempotencyKey: [
        AGENT_TURN_WORKFLOW_ID,
        context.organizationId,
        context.userId,
        request.clientRequestId,
      ].join(':'),
      inputValues: {
        request: {
          content: request.content,
          clientRequestId: request.clientRequestId,
          threadId,
          ...(request.agentType ? { agentType: request.agentType } : {}),
          ...(request.artifactReferences?.length
            ? { artifactReferences: request.artifactReferences }
            : {}),
          ...(request.attachments?.length
            ? { attachments: request.attachments }
            : {}),
          ...(thread.brandId ? { brandId: thread.brandId } : {}),
          ...(request.expectedContextVersion !== undefined
            ? { expectedContextVersion: request.expectedContextVersion }
            : {}),
          ...(request.model ? { model: request.model } : {}),
          ...(request.pageContext ? { pageContext: request.pageContext } : {}),
          ...(request.planModeEnabled !== undefined
            ? { planModeEnabled: request.planModeEnabled }
            : {}),
          ...(request.source ? { source: request.source } : {}),
          ...(request.systemPromptOverride
            ? { systemPromptOverride: request.systemPromptOverride }
            : {}),
          ...(request.transferId ? { transferId: request.transferId } : {}),
        },
      },
      metadata: {
        clientRequestId: request.clientRequestId,
        contextId,
        source: request.source ?? 'agent',
        threadId,
      },
      organizationId: context.organizationId,
      source: 'AgentTurnAcceptanceService.accept',
      userId: context.userId,
    });

    this.logger.log('Agent turn workflow accepted', {
      clientRequestId: request.clientRequestId,
      executionId,
      organizationId: context.organizationId,
      threadId,
    });

    return {
      brandId: thread.brandId ?? undefined,
      clientRequestId: request.clientRequestId,
      contextId,
      contextVersion,
      executionId,
      queuedAt,
      status: 'queued',
      threadId,
    };
  }

  private async loadThread(
    threadId: string,
    context: AgentChatContext,
  ): Promise<{ brandId: string | null; contextVersion: number }> {
    const thread = await this.prisma.agentThread.findFirstOrThrow({
      select: { brandId: true, contextVersion: true, status: true },
      where: {
        id: threadId,
        isDeleted: false,
        organizationId: context.organizationId,
        userId: context.userId,
      },
    });
    if (String(thread.status).toLowerCase() === 'archived') {
      throw new BadRequestException(ARCHIVED_THREAD_WRITE_ERROR);
    }
    return thread;
  }

  private async createThread(
    threadId: string,
    request: AgentChatRequest,
    context: AgentChatContext,
    preparedScope: Awaited<
      ReturnType<AgentScopeContextService['prepareForTurn']>
    >,
  ): Promise<{ brandId: string | null; contextVersion: number }> {
    const createData = {
      ...preparedScope.initialScopeFields,
      id: threadId,
      organizationId: context.organizationId,
      planModeEnabled: request.planModeEnabled ?? false,
      source: request.source ?? 'agent',
      status: AgentThreadStatus.ACTIVE,
      title: request.content.trim().slice(0, 120) || 'New thread',
      userId: context.userId,
    } satisfies Prisma.AgentThreadUncheckedCreateInput;
    return this.prisma.agentThread.upsert({
      create: createData,
      select: { brandId: true, contextVersion: true },
      update: {},
      where: {
        id: threadId,
        isDeleted: false,
        organizationId: context.organizationId,
      },
    });
  }
}
