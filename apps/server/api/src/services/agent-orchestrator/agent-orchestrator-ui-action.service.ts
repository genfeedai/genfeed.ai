import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { resolveEffectiveAgentExecutionConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { getAgentTurnCost } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { DEFAULT_AGENT_CHAT_MODEL } from '@api/services/agent-orchestrator/constants/agent-default-model.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
  AgentThreadUiActionRequest,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { captureRunArtifacts } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import {
  buildAgentScopeMetadata,
  recordAgentRunScope,
  withAgentScopeResult,
} from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentAutonomyMode, AgentMessageRole } from '@genfeedai/enums';
import {
  type AgentDashboardOperation,
  AgentToolName,
  type AgentUIBlock,
  type AgentUiAction,
} from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { Effect } from 'effect';

/**
 * Host callbacks into the orchestrator for plan-follow-up turns that still
 * live on the main chat loops (phase 2 keeps those on the orchestrator).
 */
export type AgentOrchestratorUiActionHost = {
  executeSynchronousChatLoop: (params: {
    context: AgentChatContext;
    generationPriority: string;
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }) => Promise<AgentChatResult>;
  generatePlanModeResponse: (params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    reviewMetadata?: {
      lastReviewAction?: 'approve' | 'request_changes';
      revisionNote?: string;
    };
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }) => Promise<AgentChatResult>;
  runInThreadLane: <T>(threadId: string, run: () => Promise<T>) => Promise<T>;
};

@Injectable()
export class AgentOrchestratorUiActionService {
  constructor(
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly agentRunsService: AgentRunsService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {}

  async handleThreadUiAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const threadId = await this.findAccessibleThreadId(
      request.threadId,
      context.organizationId,
      context.userId,
    );

    if (!threadId) {
      throw new BadRequestException('Thread not found or inaccessible.');
    }

    const orgSettings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: context.organizationId,
    });
    const { policy: basePolicy } = resolveEffectiveAgentExecutionConfig({
      organizationSettings: orgSettings,
    });
    const preparedScope = await this.agentScopeContextService.prepareForTurn({
      expectedContextVersion: request.expectedContextVersion,
      organizationId: context.organizationId,
      policyBrandId: basePolicy.brandId,
      requestedBrandId: request.brandId,
      threadId,
      userId: context.userId,
    });
    const scope = preparedScope.existingScope;
    if (!scope) {
      throw new InternalServerErrorException(
        'Unable to resolve server-authoritative agent scope.',
      );
    }
    await this.agentScopeContextService.assertConsequentialBoundary(
      scope,
      'tool',
    );
    context = {
      ...context,
      generationPriority: basePolicy.generationPriority,
      scope,
    };
    await recordAgentRunScope(this.agentRunsService, context);

    const model = await this.resolveThreadUiActionModel(
      threadId,
      context.organizationId,
    );
    const actionContent = this.describeThreadUiAction(
      request.action,
      request.payload,
    );

    await this.threadEventRecorder.recordThreadTurnRequested({
      content: actionContent,
      context,
      model,
      runId: context.runId,
      threadId,
    });

    return await host.runInThreadLane(threadId, async () => {
      await this.threadEventRecorder.recordThreadTurnStarted({
        context,
        model,
        runId: context.runId,
        threadId,
      });

      try {
        let result: AgentChatResult;
        switch (request.action) {
          case 'approve_plan':
            result = await this.executeApprovedPlanAction(
              {
                context,
                model,
                payload: request.payload,
                threadId,
              },
              host,
            );
            break;
          case 'revise_plan':
            result = await this.executeRevisedPlanAction(
              {
                context,
                model,
                payload: request.payload,
                threadId,
              },
              host,
            );
            break;
          case 'confirm_install_official_workflow':
            result = await this.executeConfirmedInstallOfficialWorkflowAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          case 'confirm_save_brand_voice_profile':
            result = await this.executeConfirmedSaveBrandVoiceProfileAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          case 'confirm_publish_post':
            result = await this.executeConfirmedPublishPostAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          default:
            throw new BadRequestException(
              `Unsupported thread UI action: ${request.action}`,
            );
        }
        return withAgentScopeResult(result, scope);
      } catch (error: unknown) {
        await this.threadEventRecorder.recordRunFailed({
          context,
          error:
            error instanceof Error
              ? error.message
              : `Thread UI action failed: ${request.action}`,
          runId: context.runId,
          threadId,
        });
        throw error;
      }
    });
  }

  private async findAccessibleThreadId(
    threadId: string | undefined,
    organizationId: string,
    userId: string,
  ): Promise<string | null> {
    if (!isEntityId(threadId)) {
      return null;
    }

    const thread = await this.agentThreadsService.findOne({
      _id: threadId,
      isDeleted: false,
      organization: organizationId,
      user: { in: [userId] },
    });

    return thread ? String(thread.id) : null;
  }

  private async resolveThreadUiActionModel(
    threadId: string,
    organizationId: string,
  ): Promise<string> {
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(threadId, organizationId),
    );

    return binding?.model?.trim()
      ? binding.model.trim()
      : DEFAULT_AGENT_CHAT_MODEL;
  }

  private describeThreadUiAction(
    action: string,
    payload?: Record<string, unknown>,
  ): string {
    if (action === 'approve_plan') {
      const planId =
        typeof payload?.planId === 'string' && payload.planId.trim()
          ? payload.planId.trim()
          : 'current plan';

      return `Approved plan ${planId}.`;
    }

    if (action === 'revise_plan') {
      const note =
        typeof payload?.revisionNote === 'string' && payload.revisionNote.trim()
          ? payload.revisionNote.trim()
          : 'with requested changes';

      return `Requested plan changes: ${note}.`;
    }

    if (action === 'confirm_install_official_workflow') {
      const sourceName =
        typeof payload?.sourceName === 'string' && payload.sourceName.trim()
          ? payload.sourceName.trim()
          : 'official workflow';

      return `Confirmed install for ${sourceName}.`;
    }

    if (action === 'confirm_publish_post') {
      const contentId =
        typeof payload?.contentId === 'string' && payload.contentId.trim()
          ? payload.contentId.trim()
          : 'selected content';

      return `Confirmed publish for ${contentId}.`;
    }

    if (action === 'confirm_save_brand_voice_profile') {
      const brandId =
        typeof payload?.brandId === 'string' && payload.brandId.trim()
          ? payload.brandId.trim()
          : 'selected brand';

      return `Approved brand voice draft for ${brandId}.`;
    }

    return `Triggered thread UI action: ${action}`;
  }

  private async executeConfirmedInstallOfficialWorkflowAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = 'install_official_workflow' as AgentToolName;
    const toolPayload = {
      ...(params.payload ?? {}),
      confirmed: true,
    };
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        apiKeyContext: params.context.apiKeyContext,
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
        brandId: params.context.scope?.brandId,
        validatedScope: params.context.scope,
      },
    );
    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.threadEventRecorder.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage =
        result.error ?? 'Failed to execute workflow install confirmation.';
      throw new InternalServerErrorException(errorMessage);
    }

    return await this.finalizeStructuredAssistantTurn({
      content: 'Official workflow installed.',
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeConfirmedPublishPostAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = AgentToolName.CREATE_POST;
    const toolPayload = {
      ...(params.payload ?? {}),
      confirmed: true,
    };
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        apiKeyContext: params.context.apiKeyContext,
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
        brandId: params.context.scope?.brandId,
        validatedScope: params.context.scope,
      },
    );
    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.threadEventRecorder.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage = result.error ?? 'Failed to publish content.';
      throw new InternalServerErrorException(errorMessage);
    }

    const totalCreated =
      typeof result.data?.totalCreated === 'number'
        ? result.data.totalCreated
        : 0;
    const scheduledAt =
      typeof result.data?.scheduledAt === 'string' &&
      result.data.scheduledAt.trim()
        ? result.data.scheduledAt.trim()
        : null;
    const createdPlatforms = Array.isArray(result.data?.createdPlatforms)
      ? (result.data.createdPlatforms as string[])
      : [];
    const platformSummary =
      createdPlatforms.length > 0 ? ` on ${createdPlatforms.join(', ')}` : '';
    const content = scheduledAt
      ? `Scheduled ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary}.`
      : `Queued ${totalCreated} post${totalCreated === 1 ? '' : 's'}${platformSummary} for publishing.`;

    return await this.finalizeStructuredAssistantTurn({
      content,
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeConfirmedSaveBrandVoiceProfileAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
    const toolName = 'save_brand_voice_profile' as AgentToolName;
    const toolPayload = {
      ...(params.payload ?? {}),
    };
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolPayload,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolPayload,
      {
        apiKeyContext: params.context.apiKeyContext,
        authToken: params.context.authToken,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        threadId: params.threadId,
        userId: params.context.userId,
        brandId: params.context.scope?.brandId,
        validatedScope: params.context.scope,
      },
    );
    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      status: result.success ? 'completed' : 'failed',
      toolName,
    };

    await this.threadEventRecorder.recordToolCompleted({
      context: params.context,
      durationMs,
      error: summary.error,
      runId: params.context.runId,
      status: summary.status,
      threadId: params.threadId,
      toolName,
    });

    if (!result.success) {
      const errorMessage = result.error ?? 'Failed to save brand voice.';
      throw new InternalServerErrorException(errorMessage);
    }

    return await this.finalizeStructuredAssistantTurn({
      content: 'Brand voice saved to the selected brand.',
      context: params.context,
      model: params.model,
      result,
      threadId: params.threadId,
      toolCalls: [summary],
    });
  }

  private async executeApprovedPlanAction(
    params: {
      context: AgentChatContext;
      model: string;
      payload?: Record<string, unknown>;
      threadId: string;
    },
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const snapshot = await runEffectPromise(
      this.getThreadSnapshotEffect(
        params.threadId,
        params.context.organizationId,
        params.context.userId,
      ),
    );
    const latestPlan = snapshot?.latestProposedPlan as
      | Record<string, unknown>
      | undefined;
    const planContent =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';
    const planId =
      typeof latestPlan?.id === 'string'
        ? latestPlan.id
        : typeof params.payload?.planId === 'string'
          ? params.payload.planId
          : 'plan';

    if (!planContent.trim()) {
      throw new BadRequestException(
        'No proposed plan is available to approve.',
      );
    }

    await this.threadEventRecorder.recordPlanUpserted({
      context: params.context,
      plan: {
        approvedAt: new Date().toISOString(),
        awaitingApproval: false,
        content: planContent,
        explanation:
          typeof latestPlan?.explanation === 'string'
            ? latestPlan.explanation
            : undefined,
        id: planId,
        lastReviewAction: 'approve',
        status: 'approved',
        steps: Array.isArray(latestPlan?.steps)
          ? (latestPlan.steps as Record<string, unknown>[])
          : undefined,
      },
      runId: params.context.runId,
      threadId: params.threadId,
    });

    const request: AgentChatRequest = {
      content: `Execute the approved plan exactly as written below. Do not regenerate a new plan unless the user explicitly asks.\n\nApproved plan:\n${planContent}`,
      model: params.model,
      source: 'agent',
      threadId: params.threadId,
    };

    return await host.executeSynchronousChatLoop({
      context: params.context,
      generationPriority: params.context.generationPriority ?? 'balanced',
      model: params.model,
      policy: {
        allowAdvancedOverrides: false,
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        brandId: params.context.scope?.brandId,
        creditGovernance: {
          useOrganizationPool: true,
        },
        generationModelOverride: undefined,
        generationPriority: params.context.generationPriority ?? 'balanced',
        platform: undefined,
        qualityTier: 'balanced',
        reviewModelOverride: undefined,
        scope: params.context.scope,
        thinkingModelOverride: undefined,
      } as ResolvedAgentExecutionPolicy,
      request,
      resolvedMemories: [],
      seedTitle: '',
      systemPromptOverride: undefined,
      threadId: params.threadId,
      turnCost: getAgentTurnCost(params.model),
    });
  }

  private async executeRevisedPlanAction(
    params: {
      context: AgentChatContext;
      model: string;
      payload?: Record<string, unknown>;
      threadId: string;
    },
    host: AgentOrchestratorUiActionHost,
  ): Promise<AgentChatResult> {
    const snapshot = await runEffectPromise(
      this.getThreadSnapshotEffect(
        params.threadId,
        params.context.organizationId,
        params.context.userId,
      ),
    );
    const latestPlan = snapshot?.latestProposedPlan as
      | Record<string, unknown>
      | undefined;
    const revisionNote =
      typeof params.payload?.revisionNote === 'string'
        ? params.payload.revisionNote.trim()
        : '';
    const previousPlan =
      typeof latestPlan?.content === 'string' ? latestPlan.content : '';

    const request: AgentChatRequest = {
      content: revisionNote
        ? `Revise the current implementation plan using this feedback: ${revisionNote}`
        : 'Revise the current implementation plan and keep execution paused for review.',
      model: params.model,
      source: 'agent',
      systemPromptOverride: previousPlan
        ? `Current proposed plan:\n${previousPlan}`
        : undefined,
      threadId: params.threadId,
    };

    return await host.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request,
      resolvedMemories: [],
      reviewMetadata: {
        lastReviewAction: 'request_changes',
        revisionNote: revisionNote || undefined,
      },
      seedTitle: '',
      systemPromptOverride: request.systemPromptOverride,
      threadId: params.threadId,
      turnCost: getAgentTurnCost(params.model),
    });
  }

  private normalizeUiBlocks(blocks: unknown[]): AgentUIBlock[] {
    const normalized: AgentUIBlock[] = [];

    for (const block of blocks) {
      if (!block || typeof block !== 'object') {
        continue;
      }

      normalized.push(block as AgentUIBlock);
    }

    return normalized;
  }

  private normalizeFinalAssistantContent(
    content: string,
    toolCalls: ToolCallSummary[],
    uiActions: AgentUiAction[],
  ): { content: string; isFallback: boolean } {
    const hasBatchGenerationResultCard = uiActions.some(
      (action) => action.type === 'batch_generation_result_card',
    );

    if (content.trim().length > 0) {
      if (hasBatchGenerationResultCard) {
        const normalizedBatchContent = content
          .replace(/^\s*Batch Details:\s*$/gim, '')
          .replace(/^\s*Batch ID:.*$/gim, '')
          .replace(/^\s*Status:.*$/gim, '')
          .replace(/^\s*Credits used:.*$/gim, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        return {
          content:
            normalizedBatchContent.length > 0
              ? normalizedBatchContent
              : 'Your batch is in motion. The latest status is below.',
          isFallback: false,
        };
      }

      return { content, isFallback: false };
    }

    if (toolCalls.length === 0 && uiActions.length === 0) {
      return { content, isFallback: false };
    }

    const hasVoiceCloneSetup = toolCalls.some(
      (toolCall) =>
        toolCall.status === 'completed' &&
        toolCall.toolName === AgentToolName.PREPARE_VOICE_CLONE,
    );

    if (hasVoiceCloneSetup) {
      return {
        content:
          'I opened voice clone setup below. Upload a sample or pick an existing voice.',
        isFallback: true,
      };
    }

    return { content: 'I prepared the next step below.', isFallback: true };
  }

  private async finalizeStructuredAssistantTurn(params: {
    content: string;
    context: AgentChatContext;
    model: string;
    result: {
      creditsUsed?: number;
      data?: Record<string, unknown>;
      nextActions?: AgentUiAction[];
      requiresConfirmation?: boolean;
      riskLevel?: 'low' | 'medium' | 'high';
    };
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Promise<AgentChatResult> {
    let latestUiBlocks: {
      operation: AgentDashboardOperation;
      blocks?: unknown[];
      blockIds?: string[];
    } | null = null;

    const rawUiBlocks = Array.isArray(params.result.data?.uiBlocks)
      ? params.result.data.uiBlocks
      : null;
    const rawOperation =
      typeof params.result.data?.operation === 'string'
        ? (params.result.data.operation as AgentDashboardOperation)
        : null;

    if (rawUiBlocks && rawOperation) {
      const normalizedBlocks = this.normalizeUiBlocks(rawUiBlocks);

      latestUiBlocks = {
        blockIds: Array.isArray(params.result.data?.blockIds)
          ? (params.result.data.blockIds as string[])
          : undefined,
        blocks: normalizedBlocks,
        operation: rawOperation,
      };

      await this.threadEventRecorder.recordUiBlocksUpdated({
        blockIds: latestUiBlocks.blockIds,
        blocks: normalizedBlocks,
        context: params.context,
        operation: rawOperation,
        runId: params.context.runId,
        threadId: params.threadId,
      });
    }

    const uiActions = params.result.nextActions ?? [];
    const enhancedUiActions =
      this.completionCardBuilder.buildAssistantUiActions({
        reviewRequired: params.result.requiresConfirmation ?? false,
        toolCalls: params.toolCalls,
        uiActions,
      });
    const normalizedContent = this.normalizeFinalAssistantContent(
      sanitizeAgentOutputText(params.content),
      params.toolCalls,
      enhancedUiActions.uiActions,
    );
    const artifactMetadata = await captureRunArtifacts(
      this.agentRunsService,
      params.context,
      params.result.data,
    );
    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...artifactMetadata,
      ...buildAgentScopeMetadata(params.context),
      isFallbackContent: normalizedContent.isFallback,
      ...this.buildResolvedModelMetadata(params.model),
      reviewRequired: params.result.requiresConfirmation ?? false,
      riskLevel: params.result.riskLevel ?? 'low',
      ...(enhancedUiActions.suggestedActions.length
        ? { suggestedActions: enhancedUiActions.suggestedActions }
        : {}),
      totalCreditsUsed: params.result.creditsUsed ?? 0,
      uiActions: enhancedUiActions.uiActions,
      ...(latestUiBlocks ? { uiBlocks: latestUiBlocks } : {}),
    };

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: normalizedContent.content,
      metadata: {
        creditsRemaining,
        ...assistantMetadata,
      },
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      toolCalls: params.toolCalls.map((toolCall) => ({
        creditsUsed: toolCall.creditsUsed,
        durationMs: toolCall.durationMs,
        error: toolCall.error,
        parameters: toolCall.parameters ?? {},
        result: toolCall.resultSummary
          ? { summary: toolCall.resultSummary }
          : {},
        status: toolCall.status,
        toolName: toolCall.toolName,
      })),
      userId: params.context.userId,
    });

    await this.threadEventRecorder.recordAssistantFinalized({
      content: normalizedContent.content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Agent completed',
      runId: params.context.runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: params.result.creditsUsed ?? 0,
      message: {
        content: normalizedContent.content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: params.toolCalls,
    };
  }

  private buildResolvedModelMetadata(
    requestedModel: string,
    actualModels?: string[],
  ): {
    actualModel: string;
    actualModels: string[];
    model: string;
    requestedModel: string;
  } {
    const normalizedActualModels = Array.from(
      new Set((actualModels ?? []).filter((model) => model.trim().length > 0)),
    );
    const fallbackModel = requestedModel.trim() || requestedModel;
    const actualModel = normalizedActualModels.at(-1) ?? fallbackModel;

    return {
      actualModel,
      actualModels: normalizedActualModels.length
        ? normalizedActualModels
        : [actualModel],
      model: actualModel,
      requestedModel,
    };
  }

  private getRuntimeBindingEffect(
    threadId: string,
    organizationId: string,
  ): Effect.Effect<
    Awaited<ReturnType<AgentRuntimeSessionService['getBinding']>> | null,
    unknown
  > {
    if (!this.agentRuntimeSessionService) {
      return Effect.succeed(null);
    }

    return this.agentRuntimeSessionService.getBindingEffect(
      threadId,
      organizationId,
    );
  }

  private getThreadSnapshotEffect(
    threadId: string,
    organizationId: string,
    userId: string,
  ): Effect.Effect<
    Awaited<ReturnType<AgentThreadEngineService['getSnapshot']>> | null,
    unknown
  > {
    if (!this.agentThreadEngineService) {
      return Effect.succeed(null);
    }

    return this.agentThreadEngineService.getSnapshotEffect(
      threadId,
      organizationId,
      userId,
    );
  }
}
