import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import { AgentScopeContextService } from '@api/index';
import type { ThreadUiActionExecutionParams } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { throwFailedUiActionResult } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-error';
import { AgentOrchestratorUiActionFinalizerService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-finalizer.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatResult,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { CacheService } from '@api/services/cache/cache.service';
import { AgentMessageRole } from '@genfeedai/contracts';
import {
  AgentToolName,
  type AgentToolResult,
  type ValidatedAgentScope,
} from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

const MESSAGE_PAGE_SIZE = 100;
const MESSAGE_MAX_PAGES = 50;

type BrandIdentityOperation = 'create' | 'rename';
type BrandIdentityProposal = {
  brandId?: string;
  contextVersion: number;
  messageId: string;
  metadata: Record<string, unknown>;
};
type BrandIdentityMessage = {
  content?: unknown;
  id?: unknown;
  metadata?: unknown;
  role?: unknown;
};

@Injectable()
export class AgentOrchestratorUiActionBrandIdentityService {
  constructor(
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly cacheService: CacheService,
    private readonly finalizer: AgentOrchestratorUiActionFinalizerService,
  ) {}

  readRequiredSourceActionId(payload?: Record<string, unknown>): string {
    const sourceActionId =
      typeof payload?.sourceActionId === 'string'
        ? payload.sourceActionId.trim()
        : '';
    if (
      !/^brand-identity-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        sourceActionId,
      )
    ) {
      throw new BadRequestException(
        'Brand identity confirmation requires a valid source action.',
      );
    }
    return sourceActionId;
  }

  async execute(
    operation: BrandIdentityOperation,
    params: ThreadUiActionExecutionParams,
  ): Promise<{ result: AgentChatResult; scope: ValidatedAgentScope }> {
    const scope = params.context.scope;
    if (!scope) {
      throw new InternalServerErrorException(
        'Unable to resolve server-authoritative agent scope.',
      );
    }
    const sourceActionId = this.readRequiredSourceActionId(params.payload);
    const proposal = await this.loadProposal({
      operation,
      organizationId: params.context.organizationId,
      sourceActionId,
      threadId: params.threadId,
    });
    const execution = await this.executeMutation({
      operation,
      params,
      proposal,
      scope,
      sourceActionId,
    });
    const confirmed = await this.resolveConfirmedScope({
      operation,
      params,
      proposal,
      result: execution.result,
      scope,
    });
    const finalized = await this.finalizeConfirmation({
      operation,
      params,
      proposal,
      result: confirmed.result,
      sourceActionId,
      summary: execution.summary,
      context: confirmed.context,
    });
    await this.consumeProposal({
      contextVersion: confirmed.scope.contextVersion,
      messageId: proposal.messageId,
      metadata: proposal.metadata,
      operation,
      organizationId: params.context.organizationId,
      sourceActionId,
      threadId: params.threadId,
    });
    return { result: finalized, scope: confirmed.scope };
  }

  private async executeMutation(input: {
    operation: BrandIdentityOperation;
    params: ThreadUiActionExecutionParams;
    proposal: BrandIdentityProposal;
    scope: ValidatedAgentScope;
    sourceActionId: string;
  }): Promise<{ result: AgentToolResult; summary: ToolCallSummary }> {
    const toolName =
      input.operation === 'create'
        ? AgentToolName.CREATE_BRAND
        : AgentToolName.RENAME_BRAND;
    const toolPayload = { ...(input.params.payload ?? {}) };
    const mutationKey = [
      'agent-brand-mutation',
      input.params.context.organizationId,
      input.params.context.userId,
      input.params.threadId,
      input.operation,
      input.sourceActionId,
    ].join(':');
    return runIdempotent(this.cacheService, mutationKey, async () => {
      const isPotentialBoundCreateRetry =
        input.operation === 'create' &&
        !!input.scope.brandId &&
        input.scope.contextVersion === input.proposal.contextVersion + 1;
      if (!isPotentialBoundCreateRetry) {
        this.assertProposalMatchesScope(input.proposal, input.scope);
      }
      const startTime = Date.now();
      await this.threadEventRecorder.recordToolStarted({
        context: input.params.context,
        parameters: toolPayload,
        runId: input.params.context.executionId,
        threadId: input.params.threadId,
        toolName,
      });
      const result = await this.toolExecutorService.executeTool(
        toolName,
        toolPayload,
        {
          apiKeyContext: input.params.context.apiKeyContext,
          brandId: input.scope.brandId,
          confirmationOrigin: 'thread-ui-action',
          generationPriority: input.params.context.generationPriority,
          organizationId: input.params.context.organizationId,
          runId: input.params.context.executionId,
          strategyId: input.params.context.strategyId,
          threadId: input.params.threadId,
          userId: input.params.context.userId,
          validatedScope: input.scope,
        },
      );
      const durationMs = Date.now() - startTime;
      const summary: ToolCallSummary = {
        creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
        durationMs,
        error: result.error,
        parameters: toolPayload,
        status: result.success ? 'completed' : 'failed',
        toolName,
      };
      await this.threadEventRecorder.recordToolCompleted({
        context: input.params.context,
        durationMs,
        error: summary.error,
        runId: input.params.context.executionId,
        status: summary.status,
        threadId: input.params.threadId,
        toolName,
      });
      if (!result.success) {
        throwFailedUiActionResult(
          result.error,
          `Failed to ${input.operation} brand.`,
        );
      }
      return { result, summary };
    });
  }

  private async resolveConfirmedScope(input: {
    operation: BrandIdentityOperation;
    params: ThreadUiActionExecutionParams;
    proposal: BrandIdentityProposal;
    result: AgentToolResult;
    scope: ValidatedAgentScope;
  }): Promise<{
    context: AgentChatContext;
    result: AgentToolResult;
    scope: ValidatedAgentScope;
  }> {
    if (input.operation === 'rename') {
      this.assertProposalMatchesScope(input.proposal, input.scope);
      return {
        context: input.params.context,
        result: input.result,
        scope: input.scope,
      };
    }
    const brandId = this.readCreatedBrandId(input.result);
    const isAlreadyBoundRetry =
      input.scope.brandId === brandId &&
      input.scope.contextVersion === input.proposal.contextVersion + 1;
    if (!isAlreadyBoundRetry) {
      this.assertProposalMatchesScope(input.proposal, input.scope);
    }
    const updatedThread = isAlreadyBoundRetry
      ? { brandId, contextVersion: input.scope.contextVersion }
      : await this.agentScopeContextService.mutateBrandScope({
          brandId,
          expectedContextVersion: input.scope.contextVersion,
          organizationId: input.params.context.organizationId,
          threadId: input.params.threadId,
          userId: input.params.context.userId,
        });
    if (typeof updatedThread.contextVersion !== 'number') {
      throw new InternalServerErrorException(
        'Confirmed brand creation did not return an updated context version.',
      );
    }
    const refreshed = await this.agentScopeContextService.prepareForTurn({
      expectedContextVersion: updatedThread.contextVersion,
      organizationId: input.params.context.organizationId,
      requestedBrandId: brandId,
      threadId: input.params.threadId,
      userId: input.params.context.userId,
    });
    if (!refreshed.existingScope) {
      throw new InternalServerErrorException(
        'Unable to refresh the confirmed brand scope.',
      );
    }
    const context = { ...input.params.context, scope: refreshed.existingScope };
    return {
      context,
      result: {
        ...input.result,
        data: {
          ...(input.result.data ?? {}),
          brandId,
          contextVersion: refreshed.existingScope.contextVersion,
        },
      },
      scope: refreshed.existingScope,
    };
  }

  private async finalizeConfirmation(input: {
    context: AgentChatContext;
    operation: BrandIdentityOperation;
    params: ThreadUiActionExecutionParams;
    proposal: BrandIdentityProposal;
    result: AgentToolResult;
    sourceActionId: string;
    summary: ToolCallSummary;
  }): Promise<AgentChatResult> {
    const replay = await this.findFinalizedAction({
      context: input.context,
      operation: input.operation,
      organizationId: input.params.context.organizationId,
      result: input.result,
      sourceActionId: input.sourceActionId,
      threadId: input.params.threadId,
      toolCalls: [input.summary],
    });
    if (replay) {
      return replay;
    }
    const label =
      typeof input.result.data?.label === 'string' &&
      input.result.data.label.trim()
        ? input.result.data.label.trim()
        : 'Brand';
    return this.finalizer.finalizeStructuredAssistantTurn({
      content:
        input.operation === 'create'
          ? `${label} created and selected for this conversation.`
          : `${label} renamed.`,
      context: input.context,
      eventIdempotencyKey: input.sourceActionId,
      metadata: {
        brandIdentityConfirmationResult: {
          operation: input.operation,
          sourceActionId: input.sourceActionId,
        },
      },
      model: input.params.model,
      result: input.result,
      threadId: input.params.threadId,
      toolCalls: [input.summary],
    });
  }

  private readCreatedBrandId(result: AgentToolResult): string {
    const brandId =
      typeof result.data?.brandId === 'string' && result.data.brandId.trim()
        ? result.data.brandId.trim()
        : typeof result.data?.id === 'string' && result.data.id.trim()
          ? result.data.id.trim()
          : '';
    if (!brandId) {
      throw new InternalServerErrorException(
        'Confirmed brand creation did not return a brand identifier.',
      );
    }
    return brandId;
  }

  private async loadProposal(input: {
    operation: BrandIdentityOperation;
    organizationId: string;
    sourceActionId: string;
    threadId: string;
  }): Promise<BrandIdentityProposal> {
    const expectedAction =
      input.operation === 'create'
        ? 'confirm_create_brand'
        : 'confirm_rename_brand';
    for (let page = 1; page <= MESSAGE_MAX_PAGES; page++) {
      const messages = await this.agentMessagesService.getMessagesByRoom(
        input.threadId,
        input.organizationId,
        { limit: MESSAGE_PAGE_SIZE, page },
      );
      for (const message of messages) {
        const proposal = this.readMatchingProposal(
          message,
          input,
          expectedAction,
        );
        if (proposal) {
          return proposal;
        }
      }
      if (messages.length < MESSAGE_PAGE_SIZE) {
        break;
      }
    }
    throw new BadRequestException(
      'Brand identity proposal was not found in this thread.',
    );
  }

  private readMatchingProposal(
    message: BrandIdentityMessage,
    input: {
      operation: BrandIdentityOperation;
      sourceActionId: string;
    },
    expectedAction: string,
  ): BrandIdentityProposal | null {
    if (String(message.role).toLowerCase() !== AgentMessageRole.ASSISTANT) {
      return null;
    }
    const metadata = this.readRecord(message.metadata);
    if (
      this.readRecord(metadata.consumedBrandIdentityActions)[
        input.sourceActionId
      ]
    ) {
      throw new ConflictException(
        'This brand identity confirmation has already been consumed.',
      );
    }
    const actions = Array.isArray(metadata.uiActions) ? metadata.uiActions : [];
    const action = actions
      .map((candidate) => this.readRecord(candidate))
      .find((candidate) => candidate.id === input.sourceActionId);
    if (!action) {
      return null;
    }
    const data = this.readRecord(action.data);
    if (
      action.type !== 'brand_identity_confirmation_card' ||
      data.operation !== input.operation ||
      data.sourceActionId !== input.sourceActionId
    ) {
      throw new BadRequestException(
        'Brand identity proposal does not match this confirmation.',
      );
    }
    const hasMatchingCta = (Array.isArray(action.ctas) ? action.ctas : []).some(
      (candidate) => {
        const cta = this.readRecord(candidate);
        return (
          cta.action === expectedAction &&
          this.readRecord(cta.payload).sourceActionId === input.sourceActionId
        );
      },
    );
    if (!hasMatchingCta) {
      throw new BadRequestException(
        'Brand identity proposal action does not match this confirmation.',
      );
    }
    return this.readProposalScope(message, metadata, data);
  }

  private readProposalScope(
    message: BrandIdentityMessage,
    metadata: Record<string, unknown>,
    data: Record<string, unknown>,
  ): BrandIdentityProposal {
    const proposalScope = this.readRecord(data.proposalScope);
    const metadataScope = this.readRecord(metadata.agentScope);
    const contextVersion = proposalScope.contextVersion;
    if (
      typeof contextVersion !== 'number' ||
      metadataScope.contextVersion !== contextVersion
    ) {
      throw new BadRequestException(
        'Brand identity proposal is missing authoritative scope metadata.',
      );
    }
    const brandId =
      typeof proposalScope.brandId === 'string'
        ? proposalScope.brandId
        : undefined;
    const metadataBrandId =
      typeof metadataScope.brandId === 'string'
        ? metadataScope.brandId
        : undefined;
    if (brandId !== metadataBrandId) {
      throw new BadRequestException(
        'Brand identity proposal scope metadata is inconsistent.',
      );
    }
    return {
      brandId,
      contextVersion,
      messageId: String(message.id),
      metadata,
    };
  }

  private async findFinalizedAction(input: {
    context: AgentChatContext;
    operation: BrandIdentityOperation;
    organizationId: string;
    result: AgentToolResult;
    sourceActionId: string;
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Promise<AgentChatResult | null> {
    for (let page = 1; page <= MESSAGE_MAX_PAGES; page++) {
      const messages = await this.agentMessagesService.getMessagesByRoom(
        input.threadId,
        input.organizationId,
        { limit: MESSAGE_PAGE_SIZE, page },
      );
      for (const message of messages) {
        if (String(message.role).toLowerCase() !== AgentMessageRole.ASSISTANT) {
          continue;
        }
        const metadata = this.readRecord(message.metadata);
        const marker = this.readRecord(
          metadata.brandIdentityConfirmationResult,
        );
        if (
          marker.sourceActionId === input.sourceActionId &&
          marker.operation === input.operation
        ) {
          return this.replayFinalizedAction(message, metadata, input);
        }
      }
      if (messages.length < MESSAGE_PAGE_SIZE) {
        break;
      }
    }
    return null;
  }

  private async replayFinalizedAction(
    message: BrandIdentityMessage,
    metadata: Record<string, unknown>,
    input: {
      context: AgentChatContext;
      organizationId: string;
      result: AgentToolResult;
      sourceActionId: string;
      threadId: string;
      toolCalls: ToolCallSummary[];
    },
  ): Promise<AgentChatResult> {
    const creditsRemaining =
      typeof metadata.creditsRemaining === 'number'
        ? metadata.creditsRemaining
        : await this.creditsUtilsService.getOrganizationCreditsBalance(
            input.organizationId,
          );
    const messageMetadata = { ...metadata };
    delete messageMetadata.creditsRemaining;
    const content = typeof message.content === 'string' ? message.content : '';
    await this.threadEventRecorder.recordAssistantFinalized({
      content,
      context: input.context,
      idempotencyKey: input.sourceActionId,
      metadata: messageMetadata,
      runId: input.context.executionId,
      threadId: input.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: input.context,
      detail: 'Agent completed',
      idempotencyKey: input.sourceActionId,
      runId: input.context.executionId,
      threadId: input.threadId,
    });
    return {
      creditsRemaining,
      creditsUsed: input.result.creditsUsed ?? 0,
      message: { content, metadata: messageMetadata, role: 'assistant' },
      threadId: input.threadId,
      toolCalls: input.toolCalls,
    };
  }

  private assertProposalMatchesScope(
    proposal: Pick<BrandIdentityProposal, 'brandId' | 'contextVersion'>,
    scope: ValidatedAgentScope,
  ): void {
    if (
      proposal.brandId !== scope.brandId ||
      proposal.contextVersion !== scope.contextVersion
    ) {
      throw new ConflictException(
        'Brand identity proposal is stale for the current thread scope.',
      );
    }
  }

  private async consumeProposal(input: {
    contextVersion: number;
    messageId: string;
    metadata: Record<string, unknown>;
    operation: BrandIdentityOperation;
    organizationId: string;
    sourceActionId: string;
    threadId: string;
  }): Promise<void> {
    const consumed = this.readRecord(
      input.metadata.consumedBrandIdentityActions,
    );
    const result = await this.agentMessagesService.patchAll(
      {
        id: input.messageId,
        organizationId: input.organizationId,
        threadId: input.threadId,
      },
      {
        metadata: {
          ...input.metadata,
          consumedBrandIdentityActions: {
            ...consumed,
            [input.sourceActionId]: {
              consumedAt: new Date().toISOString(),
              contextVersion: input.contextVersion,
              operation: input.operation,
            },
          },
        },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new InternalServerErrorException(
        'Unable to consume the persisted brand identity proposal.',
      );
    }
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
