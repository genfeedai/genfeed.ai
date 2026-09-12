import { createHash } from 'node:crypto';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { AgentScopeContextService } from '@api/index';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentTurnAcknowledgement,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentThreadStatus,
  DEFAULT_AGENT_THREAD_MODE,
  normalizeAgentThreadMode,
} from '@genfeedai/contracts';
import { toAgentScopeMetadata } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

const AGENT_TURN_WORKFLOW_ID = 'agent.turn.execute';
const ARCHIVED_THREAD_WRITE_ERROR =
  'This thread is archived. Unarchive it before sending messages or running actions.';

/**
 * Deterministic idempotency key for an agent-turn workflow execution.
 *
 * Callers that need to recover the execution a turn produced — without holding
 * the acknowledgement — resolve it through the
 * `[organizationId, idempotencyKey]` unique index rather than reconstructing an
 * id. Execution ids are cuids and carry no derivable structure.
 */
export function buildAgentTurnIdempotencyKey(
  organizationId: string,
  userId: string,
  clientRequestId: string,
): string {
  return [AGENT_TURN_WORKFLOW_ID, organizationId, userId, clientRequestId].join(
    ':',
  );
}

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
    private readonly agentMessagesService: AgentMessagesService,
    private readonly threadEngine: AgentThreadEngineService,
    @Optional()
    private readonly settingsService?: SettingsService,
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
      this.newThreadId(context, request.clientRequestId);
    const existingScope = preparedScope.existingScope;
    const thread = existingScope
      ? await this.loadThread(threadId, context)
      : await this.createThread(threadId, request, context, preparedScope);
    const contextVersion = Number(thread.contextVersion ?? 1);
    const scope =
      existingScope ??
      (await this.scopeService.resolveCreatedThreadScope({
        brandId: thread.brandId ?? undefined,
        organizationId: context.organizationId,
        threadId,
        userId: context.userId,
      }));
    if (existingScope)
      await this.resolveActiveInput(threadId, request.content, {
        ...context,
        scope,
      });
    const contextId = `${threadId}:v${contextVersion}`;
    const queuedAt = new Date().toISOString();
    const { executionId } = await this.workflowRunner.enqueueWorkflow({
      actionType: AGENT_TURN_WORKFLOW_ID,
      canonicalId: AGENT_TURN_WORKFLOW_ID,
      idempotencyKey: buildAgentTurnIdempotencyKey(
        context.organizationId,
        context.userId,
        request.clientRequestId,
      ),
      inputValues: {
        request: {
          content: request.content,
          hostSupportsApproval: request.hostSupportsApproval === true,
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
          // Acceptance has already loaded and authorized this exact thread
          // version. Pin it into the durable request so the execution
          // revalidates the same scope instead of downgrading to a missing
          // version context.
          expectedContextVersion: contextVersion,
          ...(request.generationMode
            ? { generationMode: request.generationMode }
            : {}),
          ...(request.generationSettings
            ? { generationSettings: request.generationSettings }
            : {}),
          ...(request.knowledgeSelection
            ? { knowledgeSelection: request.knowledgeSelection }
            : {}),
          ...(request.model ? { model: request.model } : {}),
          ...(request.pageContext ? { pageContext: request.pageContext } : {}),
          ...(request.agentMode !== undefined
            ? { agentMode: request.agentMode }
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

    // Acceptance owns the durable user turn. Persisting it only inside the
    // execution left titled, zero-message threads whenever provider
    // resolution failed before the generation loop reached its own idempotent
    // message upsert. The execution reuses this id, so its later write is a
    // no-op while the transcript is complete at acknowledgement.
    await this.agentMessagesService.addMessage({
      artifactReferences: request.artifactReferences,
      brandId: scope.brandId,
      content: request.content,
      id: executionId,
      metadata: {
        agentScope: toAgentScopeMetadata(scope),
        ...(request.generationMode
          ? { generationMode: request.generationMode }
          : {}),
        ...(request.generationSettings
          ? { generationSettings: request.generationSettings }
          : {}),
        ...(request.knowledgeSelection
          ? { knowledgeSelection: request.knowledgeSelection }
          : {}),
        ...(request.transferId
          ? {
              agentTransfer: {
                direction: 'inbound',
                transferId: request.transferId,
              },
            }
          : {}),
        ...(request.attachments?.length
          ? { attachments: request.attachments }
          : {}),
      },
      organizationId: context.organizationId,
      role: AgentMessageRole.USER,
      room: threadId,
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

  /**
   * A new thread with no explicit mode on the request starts in the user's
   * saved `Setting.agentMode` preference (#4672) — Manual when the user has
   * never configured one, or when settings storage is unavailable.
   */
  private async resolveDefaultAgentMode(userId: string) {
    if (!this.settingsService) {
      return DEFAULT_AGENT_THREAD_MODE;
    }
    const settings = await this.settingsService.findOne({ userId });
    return normalizeAgentThreadMode(
      (settings as { agentMode?: unknown } | null)?.agentMode,
    );
  }

  private newThreadId(context: AgentChatContext, clientRequestId: string) {
    return stableUuid(
      'agent-turn-thread',
      context.organizationId,
      context.userId,
      clientRequestId,
    );
  }

  private async resolveActiveInput(
    threadId: string,
    contentValue: string,
    context: AgentChatContext,
  ): Promise<void> {
    try {
      const snapshot = await this.threadEngine.getSnapshot(
        threadId,
        context.organizationId,
        context.userId,
      );
      const pending = snapshot.pendingInputRequests?.at(-1);
      if (pending && typeof contentValue === 'string' && contentValue.trim()) {
        const content = contentValue.trim();
        const matchingOption = pending.options.find(
          (option) =>
            option.id === content ||
            option.label.toLowerCase() === content.toLowerCase(),
        );
        if (pending.allowFreeText !== false || matchingOption) {
          await this.threadEngine.resolveInputRequest({
            threadId,
            organizationId: context.organizationId,
            userId: context.userId,
            ...(context.scope
              ? {
                  brandId: context.scope.brandId,
                  contextVersion: context.scope.contextVersion,
                }
              : {}),
            requestId: pending.requestId,
            answer: matchingOption?.id ?? content,
          });
        }
      }
    } catch (error: unknown) {
      this.logger.warn(
        'Pending agent input could not be resolved before accepting the turn',
        {
          threadId,
          organizationId: context.organizationId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
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
    const mode =
      request.agentMode ?? (await this.resolveDefaultAgentMode(context.userId));
    const createData = {
      ...preparedScope.initialScopeFields,
      id: threadId,
      mode,
      organizationId: context.organizationId,
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
