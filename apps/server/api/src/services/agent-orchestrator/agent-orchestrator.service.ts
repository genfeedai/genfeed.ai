import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import {
  type AgentFeedbackMemoryDocument,
  type AgentFeedbackMemoryInfluence,
  AgentMemoriesService,
} from '@api/collections/agent-memories/services/agent-memories.service';
import { type AgentMessageDocument } from '@api/collections/agent-messages/schemas/agent-message.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { CreateAgentRunDto } from '@api/collections/agent-runs/dto/create-agent-run.dto';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { resolveEffectiveAgentExecutionConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorPlanModeService } from '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { AgentOrchestratorRecurringTaskService } from '@api/services/agent-orchestrator/agent-orchestrator-recurring-task.service';
import { AgentOrchestratorStreamLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-stream-loop.service';
import { AgentOrchestratorSyncLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import { AgentOrchestratorUiActionService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import { getAgentTurnCost } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import {
  DEFAULT_AGENT_CHAT_MODEL,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL,
} from '@api/services/agent-orchestrator/constants/agent-default-model.constant';
import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { BRAND_INTERVIEW_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/brand-interview-system-prompt.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import type {
  AgentChatAttachment,
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
  AgentThreadUiActionRequest,
  ThreadResolutionResult,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  type AgentGenerationPriority,
  ResolvedAgentExecutionPolicy,
} from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { extractBatchTopic } from '@api/services/agent-orchestrator/utils/agent-orchestrator-input-parsing.util';
import { buildPageContextPrompt } from '@api/services/agent-orchestrator/utils/agent-page-context.util';
import { buildAgentRoutingMetadata } from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import {
  buildAgentScopeMetadata,
  recordAgentRunScope,
  withAgentScopeResult,
} from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  applyAgentReplyStyle,
  buildAgentSystemPrompt,
} from '@api/services/agent-orchestrator/utils/agent-system-prompt.util';
import {
  buildSeedThreadTitle,
  maybeUpdateThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import { AgentProfileResolverService } from '@api/services/agent-threading/services/agent-profile-resolver.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import {
  ActivitySource,
  AgentExecutionTrigger,
  AgentMessageRole,
  AgentType,
} from '@genfeedai/enums';
import {
  toAgentScopeMetadata,
  type ValidatedAgentScope,
} from '@genfeedai/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/interfaces/ai';
import {
  AgentScopeContextService,
  type PreparedAgentScope,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { Effect } from 'effect';

@Injectable()
export class AgentOrchestratorService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly uiActionService: AgentOrchestratorUiActionService,
    private readonly recurringTaskService: AgentOrchestratorRecurringTaskService,
    private readonly planModeService: AgentOrchestratorPlanModeService,
    private readonly batchService: AgentOrchestratorBatchService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly settingsService: SettingsService,
    private readonly streamEffects: AgentStreamEffectsService,
    private readonly streamLoopService: AgentOrchestratorStreamLoopService,
    private readonly syncLoopService: AgentOrchestratorSyncLoopService,
    private readonly agentRunsService: AgentRunsService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
    @Optional()
    private readonly agentExecutionLaneService?: AgentExecutionLaneService,
    @Optional()
    private readonly agentProfileResolverService?: AgentProfileResolverService,
    @Optional()
    private readonly skillRuntimeService?: SkillRuntimeService,
  ) {}

  async chat(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<AgentChatResult> {
    try {
      const userSettings = await this.settingsService.findOne({
        isDeleted: false,
        user: context.userId,
      });

      const resolved = await this.contextService.resolveSystemPromptAndModel(
        request,
        context,
      );
      const systemPromptOverride = resolved.systemPrompt;
      const resolvedMemories = resolved.memories ?? [];
      const generationPriority = context.strategyId
        ? resolved.policy.generationPriority
        : ((userSettings?.generationPriority as AgentGenerationPriority) ??
          resolved.policy.generationPriority);
      if (resolved.model !== request.model) {
        request = { ...request, model: resolved.model };
      }
      const model = request.model || DEFAULT_AGENT_CHAT_MODEL;

      const turnCost =
        request.agentType === AgentType.BRAND_INTERVIEW
          ? 0
          : getAgentTurnCost(model);
      const hasCredits =
        await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          context.organizationId,
          turnCost,
        );

      if (!hasCredits) {
        throw new Error(
          `Insufficient credits. You need at least ${turnCost} credits for ${model}.`,
        );
      }

      const threadResolution = await this.resolveOrCreateThreadId(
        request,
        context,
        resolved.preparedScope,
      );
      const { isCreated, seedTitle, threadId } = threadResolution;
      const scope = isCreated
        ? await this.agentScopeContextService.resolveCreatedThreadScope({
            brandId: resolved.preparedScope.initialBrandId,
            organizationId: context.organizationId,
            threadId,
            userId: context.userId,
          })
        : resolved.preparedScope.existingScope;

      if (!scope) {
        throw new InternalServerErrorException(
          'Unable to resolve server-authoritative agent scope.',
        );
      }

      const policy: ResolvedAgentExecutionPolicy = {
        ...resolved.policy,
        brandId: scope.brandId,
        scope,
      };
      context = {
        ...context,
        resolvedSkills: resolved.resolvedSkills,
        scope,
      };
      await recordAgentRunScope(this.agentRunsService, context);
      await this.recordProfileSnapshot(threadId, context, request.agentType);
      await this.threadEventRecorder.recordThreadTurnRequested({
        content: request.content,
        context,
        model,
        runId: context.runId,
        source: request.source,
        threadId,
      });

      await this.agentMessagesService.addMessage({
        artifactReferences: request.artifactReferences,
        brandId: scope.brandId,
        content: request.content,
        metadata: {
          agentScope: toAgentScopeMetadata(scope),
          ...(request.attachments?.length
            ? { attachments: request.attachments }
            : {}),
        },
        organizationId: context.organizationId,
        role: AgentMessageRole.USER,
        room: threadId,
        userId: context.userId,
      });

      const planModeResponse = await this.planModeService.tryHandlePlanModeTurn(
        {
          context,
          model,
          request,
          resolvedMemories,
          seedTitle,
          systemPromptOverride,
          threadId,
          turnCost,
        },
        {
          maybeUpdateThreadTitle: (p) =>
            maybeUpdateThreadTitle({
              ...p,
              agentThreadsService: this.agentThreadsService,
            }),
        },
      );

      if (planModeResponse) {
        return withAgentScopeResult(planModeResponse, scope);
      }

      const deterministicResponse =
        await this.recurringTaskService.tryHandleRecurringTaskDraftTurn({
          context,
          model,
          requestContent: request.content,
          seedTitle,
          threadId,
        });

      if (deterministicResponse) {
        return withAgentScopeResult(deterministicResponse, scope);
      }

      const result = await this.runInThreadLane(threadId, async () => {
        return this.syncLoopService.executeSynchronousChatLoop({
          context,
          generationPriority,
          model,
          policy,
          request,
          resolvedMemories,
          seedTitle,
          systemPromptOverride,
          threadId,
          turnCost,
        });
      });
      return withAgentScopeResult(result, scope);
    } catch (error: unknown) {
      if (error instanceof Error && error.name.includes('ValidationError')) {
        this.loggerService.error(
          `${this.constructorName} ValidationError during chat`,
          {
            error: (error as Error).message,
            model: request.model,
            organizationId: context.organizationId,
            userId: context.userId,
          },
        );
        throw new InternalServerErrorException(
          'Agent chat failed due to a data validation error. Please try again.',
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.loggerService.error(`${this.constructorName} chat failed`, {
        error: error instanceof Error ? error.message : error,
        model: request.model,
        organizationId: context.organizationId,
        userId: context.userId,
      });

      throw error;
    }
  }

  async handleThreadUiAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
  ): Promise<AgentChatResult> {
    return await this.uiActionService.handleThreadUiAction(request, context, {
      executeSynchronousChatLoop: (params) =>
        this.syncLoopService.executeSynchronousChatLoop(params),
      generatePlanModeResponse: (params) =>
        this.planModeService.generatePlanModeResponse(params, {
          maybeUpdateThreadTitle: (p) =>
            maybeUpdateThreadTitle({
              ...p,
              agentThreadsService: this.agentThreadsService,
            }),
        }),
      runInThreadLane: (threadId, run) => this.runInThreadLane(threadId, run),
    });
  }

  async chatStream(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<{
    brandId?: string;
    contextVersion: number;
    threadId: string;
    runId: string;
    startedAt: string;
  }> {
    // Look up user's generation priority setting
    const userSettings = await this.settingsService.findOne({
      isDeleted: false,
      user: context.userId,
    });

    const resolved = await this.contextService.resolveSystemPromptAndModel(
      request,
      context,
    );
    const systemPromptOverride = resolved.systemPrompt;
    const resolvedMemories = resolved.memories ?? [];
    const generationPriority = context.strategyId
      ? resolved.policy.generationPriority
      : ((userSettings?.generationPriority as AgentGenerationPriority) ??
        resolved.policy.generationPriority);
    if (resolved.model !== request.model) {
      request = { ...request, model: resolved.model };
    }

    const model = request.model || DEFAULT_AGENT_CHAT_MODEL;

    // Brand interview turns are free — the engine charges 10 credits once via
    // BrandInterviewService.start(). Never double-bill the per-turn cost.
    const turnCost =
      request.agentType === AgentType.BRAND_INTERVIEW
        ? 0
        : getAgentTurnCost(model);
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        context.organizationId,
        turnCost,
      );

    if (!hasCredits) {
      throw new Error(
        `Insufficient credits. You need at least ${turnCost} credits for ${model}.`,
      );
    }

    const threadResolution = await this.resolveOrCreateThreadId(
      request,
      context,
      resolved.preparedScope,
    );
    const { isCreated, seedTitle, threadId } = threadResolution;
    const scope = isCreated
      ? await this.agentScopeContextService.resolveCreatedThreadScope({
          brandId: resolved.preparedScope.initialBrandId,
          organizationId: context.organizationId,
          threadId,
          userId: context.userId,
        })
      : resolved.preparedScope.existingScope;

    if (!scope) {
      throw new InternalServerErrorException(
        'Unable to resolve server-authoritative agent scope.',
      );
    }

    const policy: ResolvedAgentExecutionPolicy = {
      ...resolved.policy,
      brandId: scope.brandId,
      scope,
    };
    const scopeMetadata = toAgentScopeMetadata(scope);

    const createdRun = await this.agentRunsService.create({
      brand: scope.brandId,
      label: request.content.slice(0, 120),
      metadata: {
        agentScope: scopeMetadata,
        model,
        requestedModel: model,
        ...buildAgentRoutingMetadata({
          model,
          prompt: request.content,
          source: request.source,
        }),
        source: request.source ?? 'agent',
        threadId,
      },
      objective: request.content,
      organization: context.organizationId,
      thread: threadId,
      trigger: AgentExecutionTrigger.MANUAL,
      user: context.userId,
    } as unknown as CreateAgentRunDto);
    const runId = String((createdRun as { id: string }).id);
    const startedRun = await this.agentRunsService.start(
      runId,
      context.organizationId,
    );
    const startedAt =
      startedRun?.startedAt?.toISOString?.() ?? new Date().toISOString();
    const streamContext: AgentChatContext = {
      ...context,
      resolvedSkills: resolved.resolvedSkills,
      runId,
      scope,
    };
    await this.recordProfileSnapshot(
      threadId,
      streamContext,
      request.agentType,
    );
    await this.threadEventRecorder.recordThreadTurnRequested({
      content: request.content,
      context: streamContext,
      model,
      runId,
      source: request.source,
      threadId,
    });
    await runEffectPromise(
      this.upsertRuntimeBindingEffect({
        model,
        organizationId: context.organizationId,
        runId,
        status: 'running',
        threadId,
      }),
    );

    // Save user message
    await this.agentMessagesService.addMessage({
      artifactReferences: request.artifactReferences,
      brandId: scope.brandId,
      content: request.content,
      metadata: {
        agentScope: scopeMetadata,
        ...(request.attachments?.length
          ? { attachments: request.attachments }
          : {}),
      },
      organizationId: context.organizationId,
      role: AgentMessageRole.USER,
      room: threadId,
      userId: context.userId,
    });

    const handledPlanMode =
      await this.planModeService.tryHandlePlanModeTurnStream(
        {
          context: streamContext,
          model,
          request,
          resolvedMemories,
          seedTitle,
          startedAt,
          systemPromptOverride,
          threadId,
          turnCost,
        },
        {
          maybeUpdateThreadTitle: (p) =>
            maybeUpdateThreadTitle({
              ...p,
              agentThreadsService: this.agentThreadsService,
            }),
        },
      );

    if (handledPlanMode) {
      return {
        brandId: scope.brandId,
        contextVersion: scope.contextVersion,
        runId,
        startedAt,
        threadId,
      };
    }

    let handledDeterministically: boolean;
    try {
      handledDeterministically =
        (await this.batchService.tryHandleBatchGenerationTurnStream(
          {
            context: streamContext,
            model,
            policy,
            requestContent: request.content,
            seedTitle,
            startedAt,
            threadId,
          },
          {
            maybeUpdateThreadTitle: (p) =>
              maybeUpdateThreadTitle({
                ...p,
                agentThreadsService: this.agentThreadsService,
              }),
          },
        )) ||
        (await this.recurringTaskService.tryHandleRecurringTaskDraftTurnStream({
          context: streamContext,
          model,
          requestContent: request.content,
          seedTitle,
          startedAt,
          threadId,
        }));
    } catch (error: unknown) {
      await runEffectPromise(
        this.streamEffects.publishStreamFailureEffect({
          context: streamContext,
          error: error instanceof Error ? error.message : 'Unknown error',
          failRun: true,
          threadId,
        }),
      );
      throw error;
    }

    if (handledDeterministically) {
      return {
        brandId: scope.brandId,
        contextVersion: scope.contextVersion,
        runId,
        startedAt,
        threadId,
      };
    }

    // Fire-and-forget streaming
    this.runInThreadLane(threadId, async () => {
      await this.streamLoopService.runStreamLoop(
        streamContext,
        threadId,
        systemPromptOverride,
        model,
        turnCost,
        policy,
        generationPriority,
        resolvedMemories,
        request.agentType,
        request.source,
        seedTitle,
        startedAt,
        request.attachments,
      );
    }).catch((error: unknown) => {
      this.loggerService.error(
        `${this.constructorName} runStreamLoop unhandled rejection`,
        {
          error: error instanceof Error ? error.message : error,
          threadId,
        },
      );
    });

    return {
      brandId: scope.brandId,
      contextVersion: scope.contextVersion,
      runId,
      startedAt,
      threadId,
    };
  }

  private async resolveOrCreateThreadId(
    request: AgentChatRequest,
    context: AgentChatContext,
    preparedScope: PreparedAgentScope,
  ): Promise<ThreadResolutionResult> {
    if (preparedScope.existingScope) {
      return {
        isCreated: false,
        seedTitle: '',
        threadId: preparedScope.existingScope.threadId,
      };
    }

    const seedTitle = buildSeedThreadTitle(request.content);

    const thread = await this.agentThreadsService.create({
      ...preparedScope.initialScopeFields,
      organizationId: context.organizationId,
      planModeEnabled: request.planModeEnabled ?? false,
      source: request.source || 'agent',
      title: seedTitle,
      userId: context.userId,
    });
    return {
      isCreated: true,
      seedTitle,
      threadId: String(thread.id),
    };
  }

  async resumeRecurringTaskDraftFromInput(params: {
    answer: string;
    fieldId?: string;
    organizationId: string;
    runId?: string;
    scope: ValidatedAgentScope;
    threadId: string;
    userId: string;
  }): Promise<void> {
    return await this.recurringTaskService.resumeRecurringTaskDraftFromInput(
      params,
    );
  }

  private async recordProfileSnapshot(
    threadId: string,
    context: AgentChatContext,
    agentType?: AgentType,
  ): Promise<void> {
    if (!this.agentProfileResolverService || !this.agentThreadEngineService) {
      return;
    }

    const profile = this.agentProfileResolverService.resolve({
      agentType,
      campaignId: context.campaignId,
      strategyId: context.strategyId,
    });

    // Merge skill tool overrides into the profile snapshot
    if (context.resolvedSkills?.length && this.skillRuntimeService) {
      const enabledTools = this.skillRuntimeService.mergeSkillToolOverrides(
        profile.enabledTools,
        context.resolvedSkills,
      );

      if (enabledTools) {
        profile.enabledTools = enabledTools;
      }
    }

    await runEffectPromise(
      this.recordThreadProfileSnapshotEffect(
        threadId,
        context.organizationId,
        context.userId,
        profile,
      ),
    );
  }

  private async runInThreadLane<T>(
    threadId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    return runEffectPromise(this.runInThreadLaneEffect(threadId, run));
  }

  private upsertRuntimeBindingEffect(params: {
    threadId: string;
    organizationId: string;
    runId?: string;
    model?: string;
    status: 'running' | 'waiting_input' | 'completed' | 'cancelled' | 'failed';
    resumeCursor?: Record<string, unknown>;
  }): Effect.Effect<void, unknown> {
    if (!this.agentRuntimeSessionService) {
      return Effect.void;
    }

    return this.agentRuntimeSessionService
      .upsertBindingEffect(params)
      .pipe(Effect.asVoid);
  }

  private recordThreadProfileSnapshotEffect(
    threadId: string,
    organizationId: string,
    userId: string,
    profile: object,
  ): Effect.Effect<void, unknown> {
    if (!this.agentThreadEngineService) {
      return Effect.void;
    }

    return this.agentThreadEngineService
      .recordProfileSnapshotEffect(threadId, organizationId, userId, profile)
      .pipe(Effect.asVoid);
  }

  private runInThreadLaneEffect<T>(
    threadId: string,
    run: () => Promise<T> | T,
  ): Effect.Effect<T, unknown> {
    if (!this.agentExecutionLaneService) {
      return fromPromiseEffect(run);
    }

    return this.agentExecutionLaneService.runExclusiveEffect(threadId, () =>
      fromPromiseEffect(run),
    );
  }
}
