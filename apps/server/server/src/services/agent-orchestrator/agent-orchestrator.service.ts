import { randomUUID } from 'node:crypto';
import {
  AgentExecutionTrigger,
  AgentMessageRole,
  AgentThreadStatus,
  AgentType,
  toRouterPriority,
} from '@genfeedai/enums';
import {
  toAgentScopeMetadata,
  type ValidatedAgentScope,
} from '@genfeedai/interfaces';
import {
  AgentScopeContextService,
  type PreparedAgentScope,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { AgentMessagesService } from '@server/collections/agent-messages/services/agent-messages.service';
import { CreateAgentRunDto } from '@server/collections/agent-runs/dto/create-agent-run.dto';
import { AgentRunsService } from '@server/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@server/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { SettingsService } from '@server/collections/settings/services/settings.service';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@server/helpers/utils/effect/effect.util';
import { AgentChatModelRegistryService } from '@server/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentOrchestratorBatchService } from '@server/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@server/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorPlanModeService } from '@server/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { AgentOrchestratorRecurringTaskService } from '@server/services/agent-orchestrator/agent-orchestrator-recurring-task.service';
import { AgentOrchestratorStreamLoopService } from '@server/services/agent-orchestrator/agent-orchestrator-stream-loop.service';
import { AgentOrchestratorSyncLoopService } from '@server/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import { AgentOrchestratorUiActionService } from '@server/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentStreamEffectsService } from '@server/services/agent-orchestrator/agent-stream-effects.service';
import { AgentThreadEventRecorderService } from '@server/services/agent-orchestrator/agent-thread-event-recorder.service';
import { AgentTurnAcceptanceService } from '@server/services/agent-orchestrator/agent-turn-acceptance.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
  AgentThreadUiActionRequest,
  AgentTurnAcknowledgement,
  ThreadResolutionResult,
} from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';
import { ResolvedAgentExecutionPolicy } from '@server/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { extractAgentGenerationSettings } from '@server/services/agent-orchestrator/utils/agent-generation-composer-settings.util';
import { buildAgentRoutingMetadata } from '@server/services/agent-orchestrator/utils/agent-routing-policy.util';
import {
  classifyAgentRunFailure,
  readAgentRunPublicError,
} from '@server/services/agent-orchestrator/utils/agent-run-failure.util';
import {
  recordAgentRunScope,
  withAgentScopeResult,
} from '@server/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  buildSeedThreadTitle,
  maybeUpdateThreadTitle,
} from '@server/services/agent-orchestrator/utils/agent-thread-title.util';
import { AgentExecutionLaneService } from '@server/services/agent-threading/services/agent-execution-lane.service';
import { AgentProfileResolverService } from '@server/services/agent-threading/services/agent-profile-resolver.service';
import {
  AgentRuntimeSessionService,
  upsertRuntimeBindingEffect,
} from '@server/services/agent-threading/services/agent-runtime-session.service';
import type { AgentThreadEngineService } from '@server/services/agent-threading/services/agent-thread-engine.service';
import { SkillRuntimeService } from '@server/services/skill-runtime/skill-runtime.service';
import { Effect } from 'effect';

const ARCHIVED_THREAD_WRITE_ERROR =
  'This thread is archived. Unarchive it before sending messages or running actions.';

type StreamingAgentRunAttemptInput = CreateAgentRunDto & {
  id: string;
  threadId: string;
};

@Injectable()
export class AgentOrchestratorService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
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
    @Optional()
    private readonly turnAcceptanceService?: AgentTurnAcceptanceService,
  ) {}

  async acceptChatStream(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<AgentTurnAcknowledgement> {
    if (!request.clientRequestId) {
      throw new BadRequestException('clientRequestId is required.');
    }
    if (!this.turnAcceptanceService) {
      throw new InternalServerErrorException(
        'Durable agent turn acceptance is unavailable.',
      );
    }
    return this.turnAcceptanceService.accept(
      request as AgentChatRequest & { clientRequestId: string },
      context,
    );
  }

  async chat(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<AgentChatResult> {
    try {
      const userSettings = await this.settingsService.findOne({
        userId: context.userId,
      });
      // Chat has no user-facing model picker: the resolver below always
      // returns the pinned catalogue default unless a strategy, thinking
      // override, or agent-type default applies. request.model is never
      // read for that decision.
      const resolved = await this.contextService.resolveSystemPromptAndModel(
        request,
        context,
      );
      const systemPromptOverride = resolved.systemPrompt;
      const resolvedMemories = resolved.memories ?? [];
      const generationPriority = context.strategyId
        ? resolved.policy.generationPriority
        : (toRouterPriority(userSettings?.generationPriority) ??
          resolved.policy.generationPriority);
      if (resolved.model !== request.model) {
        request = { ...request, model: resolved.model };
      }
      const model = request.model;

      const turnCost =
        request.agentType === AgentType.BRAND_INTERVIEW
          ? 0
          : await this.agentChatModelRegistry.getRoundCredits(model);
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
      await this.assertThreadWritable(
        threadId,
        context.organizationId,
        isCreated,
      );
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
        generationMode: request.generationMode,
        generationSettings: extractAgentGenerationSettings(
          request.pageContext?.draftInstructions,
        ),
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
          ...(request.generationMode
            ? { generationMode: request.generationMode }
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
    const executionStartedAt = Date.now();
    const contextStartedAt = Date.now();
    const contextResolution = await (async () => {
      const userSettings = await this.settingsService.findOne({
        userId: context.userId,
      });
      // Chat has no user-facing model picker: the resolver below always
      // returns the pinned catalogue default unless a strategy, thinking
      // override, or agent-type default applies. request.model is never
      // read for that decision.
      const resolved = await this.contextService.resolveSystemPromptAndModel(
        request,
        context,
      );
      return { request, resolved, userSettings };
    })().catch((error: unknown) => {
      this.loggerService.error(`${this.constructorName} stage failed`, {
        clientRequestId: request.clientRequestId,
        durationMs: Date.now() - contextStartedAt,
        error: error instanceof Error ? error.message : String(error),
        organizationId: context.organizationId,
        outcome: 'failed',
        runId: context.runId,
        stage: 'context_assembly',
        threadId: request.threadId,
      });
      throw error;
    });
    request = contextResolution.request;
    const { resolved, userSettings } = contextResolution;
    this.loggerService.log(`${this.constructorName} stage completed`, {
      clientRequestId: request.clientRequestId,
      durationMs: Date.now() - contextStartedAt,
      organizationId: context.organizationId,
      outcome: 'completed',
      runId: context.runId,
      stage: 'context_assembly',
      threadId: request.threadId,
    });
    const systemPromptOverride = resolved.systemPrompt;
    const resolvedMemories = resolved.memories ?? [];
    const generationPriority = context.strategyId
      ? resolved.policy.generationPriority
      : (toRouterPriority(userSettings?.generationPriority) ??
        resolved.policy.generationPriority);
    if (resolved.model !== request.model) {
      request = { ...request, model: resolved.model };
    }

    const model = request.model;

    // Brand interview turns are free — the engine charges 10 credits once via
    // BrandInterviewService.start(). Never double-bill the per-turn cost.
    const turnCost =
      request.agentType === AgentType.BRAND_INTERVIEW
        ? 0
        : await this.agentChatModelRegistry.getRoundCredits(model);
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
    await this.assertThreadWritable(
      threadId,
      context.organizationId,
      isCreated,
    );
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
    const attemptId = context.runId ?? randomUUID();
    const baseRunInput: StreamingAgentRunAttemptInput = {
      brandId: scope.brandId,
      id: attemptId,
      label: request.content.slice(0, 120),
      metadata: {
        agentScope: scopeMetadata,
        model,
        requestedModel: model,
        source: request.source ?? 'agent',
        threadId,
      },
      objective: request.content,
      organizationId: context.organizationId,
      threadId,
      trigger: AgentExecutionTrigger.MANUAL,
      userId: context.userId,
    };
    let runId: string | undefined;

    try {
      const routingMetadata = buildAgentRoutingMetadata({
        defaultModelKey: await this.agentChatModelRegistry.getDefaultModelKey(),
        model,
        prompt: request.content,
        source: request.source,
      });
      if (context.runId) {
        runId = context.runId;
        await this.agentRunsService.mergeMetadata(
          runId,
          context.organizationId,
          {
            ...baseRunInput.metadata,
            ...routingMetadata,
            requestState: 'running',
          },
        );
      } else {
        const createdRun = await this.agentRunsService.create({
          ...baseRunInput,
          metadata: {
            ...baseRunInput.metadata,
            ...routingMetadata,
          },
        });
        runId = String((createdRun as { id: string }).id);
      }
      const startedRun = await this.agentRunsService.start(
        runId,
        context.organizationId,
      );
      const startedAt =
        startedRun?.startedAt?.toISOString?.() ?? new Date().toISOString();
      const streamContext: AgentChatContext = {
        ...context,
        generationMode: request.generationMode,
        generationSettings: extractAgentGenerationSettings(
          request.pageContext?.draftInstructions,
        ),
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
        upsertRuntimeBindingEffect(this.agentRuntimeSessionService, {
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
        ...(context.executionMode === 'background' ? { id: runId } : {}),
        metadata: {
          agentScope: scopeMetadata,
          ...(request.generationMode
            ? { generationMode: request.generationMode }
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

      const handledDeterministically =
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

      if (handledDeterministically) {
        return {
          brandId: scope.brandId,
          contextVersion: scope.contextVersion,
          runId,
          startedAt,
          threadId,
        };
      }

      const executeStream = () =>
        this.runInThreadLane(threadId, async () => {
          const providerStartedAt = Date.now();
          try {
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
            this.loggerService.log(`${this.constructorName} stage completed`, {
              clientRequestId: request.clientRequestId,
              durationMs: Date.now() - providerStartedAt,
              organizationId: context.organizationId,
              outcome: 'completed',
              runId,
              stage: 'llm_provider_execution',
              threadId,
              totalDurationMs: Date.now() - executionStartedAt,
            });
          } catch (error: unknown) {
            this.loggerService.error(`${this.constructorName} stage failed`, {
              clientRequestId: request.clientRequestId,
              durationMs: Date.now() - providerStartedAt,
              error: error instanceof Error ? error.message : String(error),
              organizationId: context.organizationId,
              outcome: 'failed',
              runId,
              stage: 'llm_provider_execution',
              threadId,
            });
            throw error;
          }
        });

      if (context.executionMode === 'background') {
        await executeStream();
      } else {
        // Legacy in-process callers retain immediate stream acknowledgement.
        executeStream().catch((error: unknown) => {
          this.loggerService.error(
            `${this.constructorName} runStreamLoop unhandled rejection`,
            {
              error: error instanceof Error ? error.message : error,
              threadId,
            },
          );
        });
      }

      return {
        brandId: scope.brandId,
        contextVersion: scope.contextVersion,
        runId,
        startedAt,
        threadId,
      };
    } catch (error: unknown) {
      // Accepted background turns are retried by BullMQ. Publishing or
      // persisting failure here would expose a non-final attempt as terminal
      // and leave failed events behind even when a later attempt succeeds.
      if (context.executionMode === 'background') {
        throw error;
      }

      const persistedError = classifyAgentRunFailure(error);

      try {
        if (runId) {
          await runEffectPromise(
            this.streamEffects.publishStreamFailureEffect({
              context: {
                ...context,
                resolvedSkills: resolved.resolvedSkills,
                runId,
                scope,
              },
              error: readAgentRunPublicError(error),
              failRun: true,
              persistedError,
              threadId,
            }),
          );
        } else {
          await this.agentRunsService.recordFailedAttempt(
            attemptId,
            baseRunInput,
            persistedError,
          );
        }
      } catch (persistenceError: unknown) {
        this.loggerService.error(
          `${this.constructorName} failed to persist pre-stream agent run failure`,
          {
            error:
              persistenceError instanceof Error
                ? persistenceError.message
                : persistenceError,
            organizationId: context.organizationId,
            threadId,
          },
        );
      }

      throw error;
    }
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

  /**
   * Hard gate: archived threads cannot accept chat turns or mutating runs.
   * Client read-only UI is not enough — regenerate must fail server-side too.
   */
  private async assertThreadWritable(
    threadId: string,
    organizationId: string,
    isCreated: boolean,
  ): Promise<void> {
    if (isCreated) {
      return;
    }

    const thread = await this.agentThreadsService.findOne({
      id: threadId,
      organizationId,
    });

    // Soft-deleted threads bypass the archived gate the same way missing ones
    // do — matching the semantics of the previous isDeleted filter.
    if (!thread || thread.isDeleted) {
      return;
    }

    const status = String(
      (thread as { status?: string | null }).status ?? '',
    ).toLowerCase();
    if (status === AgentThreadStatus.ARCHIVED || status === 'archived') {
      throw new BadRequestException(ARCHIVED_THREAD_WRITE_ERROR);
    }
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
