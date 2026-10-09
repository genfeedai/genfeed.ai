import { runWithGenerationEntry } from '@api/action-origin/action-origin.context';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { AGENT_RUNTIME_ACTION_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorPlanModeService } from '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { AgentOrchestratorRecurringTaskService } from '@api/services/agent-orchestrator/agent-orchestrator-recurring-task.service';
import { AgentOrchestratorStreamLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-stream-loop.service';
import { AgentOrchestratorSyncLoopService } from '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service';
import { AgentOrchestratorUiActionService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
  AgentThreadUiActionRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { persistComposerGenerationSource } from '@api/services/agent-orchestrator/persist-composer-generation-source';
import { buildAgentRoutingMetadata } from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import {
  buildSeedThreadTitle,
  maybeUpdateThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import {
  optionalString,
  projectAgentTurnRequest,
  requiredString,
} from '@api/services/agent-orchestrator/utils/agent-turn-request-projection.util';
import { announceUiActionRun } from '@api/services/agent-orchestrator/utils/agent-ui-action-announcement.util';
import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import {
  AgentRuntimeSessionService,
  upsertRuntimeBinding,
} from '@api/services/agent-threading/services/agent-runtime-session.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentMessageRole,
  AgentThreadStatus,
  AgentType,
  isExplicitAgentMediaGenerationMode,
  resolveAgentTurnGenerationMode,
  toRouterPriority,
} from '@genfeedai/contracts';
import {
  toAgentScopeMetadata,
  type ValidatedAgentScope,
} from '@genfeedai/contracts/interfaces';
import { parseGenerationEntry } from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  type OnModuleInit,
} from '@nestjs/common';

export type PreparedAgentTurnState = {
  campaignId?: string;
  executionId: string;
  organizationId: string;
  request: AgentChatRequest & { threadId: string };
  strategyId?: string;
  threadId: string;
  userId: string;
};

export type AgentTurnWorkflowResult = {
  artifactReferences: unknown[];
  artifactVersionPinIds: string[];
  content: string;
  creditsUsed: number;
  model: string | null;
  summary: string;
  threadId: string;
};

const ARCHIVED_THREAD_WRITE_ERROR =
  'This thread is archived. Unarchive it before sending messages or running actions.';

@Injectable()
export class AgentTurnWorkflowExecutionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly planModeService: AgentOrchestratorPlanModeService,
    private readonly batchService: AgentOrchestratorBatchService,
    private readonly recurringTaskService: AgentOrchestratorRecurringTaskService,
    private readonly streamLoopService: AgentOrchestratorStreamLoopService,
    private readonly syncLoopService: AgentOrchestratorSyncLoopService,
    private readonly uiActionService: AgentOrchestratorUiActionService,
    private readonly streamEffects: AgentStreamEffectsService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly executionLaneService: AgentExecutionLaneService,
    private readonly runtimeSessionService: AgentRuntimeSessionService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    const registerAction = this.workflowRunner.registerAction.bind(
      this.workflowRunner,
    );
    registerAction(AGENT_RUNTIME_ACTION_IDS.TURN_PREPARE, (request) =>
      this.prepare(request.input.request, {
        executionId: request.provenance.executionId,
        organizationId: request.context.organizationId,
        userId: request.context.userId,
      }),
    );
    registerAction(AGENT_RUNTIME_ACTION_IDS.TURN_INFER, async ({ input }) => {
      const state = input.state as PreparedAgentTurnState;
      return {
        decision: 'final' as const,
        final: await runWithGenerationEntry(state.request.generationEntry, () =>
          this.execute(state),
        ),
        state,
        toolItems: [],
      };
    });
    registerAction(
      AGENT_RUNTIME_ACTION_IDS.TURN_FINALIZE,
      ({ input }) => input.final as AgentTurnWorkflowResult,
    );
    registerAction(AGENT_RUNTIME_ACTION_IDS.TURN_FAIL, (request) =>
      this.recordWorkflowFailure(request),
    );
    registerAction(
      AGENT_RUNTIME_ACTION_IDS.UI_ACTION,
      ({ context, input, provenance }) => {
        const request = readRecord(input.request);
        const generationEntry = parseGenerationEntry(request.generationEntry);
        return runWithGenerationEntry(generationEntry, () =>
          this.executeUiAction(
            request as unknown as AgentThreadUiActionRequest,
            {
              executionId: provenance.executionId,
              generationEntry,
              organizationId: context.organizationId,
              userId: context.userId,
            },
          ),
        );
      },
    );
    registerAction(
      AGENT_RUNTIME_ACTION_IDS.INPUT_RESPONSE,
      ({ context, input, provenance }) => {
        const request = readRecord(input.request);
        return runWithGenerationEntry(request.generationEntry, () =>
          this.resumeInput({
            answer: requiredString(request.answer, 'request.answer'),
            executionId: provenance.executionId,
            ...(optionalString(request.fieldId)
              ? { fieldId: optionalString(request.fieldId) }
              : {}),
            organizationId: context.organizationId,
            scope: readRecord(request.scope) as unknown as ValidatedAgentScope,
            threadId: requiredString(request.threadId, 'request.threadId'),
            userId: context.userId,
          }),
        );
      },
    );
  }

  private async recordWorkflowFailure(
    request: SystemWorkflowActionRequest,
  ): Promise<{ error: string; threadId: string | null }> {
    const failure = readRecord(request.input.failure);
    const error =
      optionalString(failure.error) ??
      optionalString(failure.message) ??
      optionalString(request.input.failure);
    if (!error) {
      throw new BadRequestException('Agent workflow failure requires an error');
    }
    const state = readRecord(request.input.state);
    const originalRequest = readRecord(request.input.request);
    const threadId =
      optionalString(state.threadId) ??
      optionalString(originalRequest.threadId) ??
      null;
    await this.recordFailure({
      error,
      executionId: request.provenance.executionId,
      organizationId: request.context.organizationId,
      ...(threadId ? { threadId } : {}),
      userId: request.context.userId,
    });
    return { error, threadId };
  }

  async prepare(
    value: unknown,
    workflowContext: {
      executionId: string;
      organizationId: string;
      userId: string;
    },
  ): Promise<{
    brandId: string | null;
    contextVersion: number;
    state: PreparedAgentTurnState;
    threadId: string;
  }> {
    const request = projectAgentTurnRequest(value);
    const thread = await this.prisma.agentThread.findFirst({
      select: {
        brandId: true,
        contextVersion: true,
        status: true,
        agentStrategyId: true,
      },
      where: {
        id: request.threadId,
        isDeleted: false,
        organizationId: workflowContext.organizationId,
        userId: workflowContext.userId,
      },
    });
    if (!thread) {
      throw new Error('Agent thread not found or inaccessible');
    }
    if (String(thread.status).toLowerCase() === AgentThreadStatus.ARCHIVED) {
      throw new Error(ARCHIVED_THREAD_WRITE_ERROR);
    }
    if (
      request.creditBudget !== undefined ||
      request.autonomyMode !== undefined ||
      request.source === 'proactive'
    ) {
      const execution = await this.prisma.workflowExecution.findFirst({
        where: {
          id: workflowContext.executionId,
          organizationId: workflowContext.organizationId,
          isDeleted: false,
        },
        select: { result: true },
      });
      const metadata = readRecord(readRecord(execution?.result).metadata);
      const strategy = request.strategyId
        ? await this.prisma.agentStrategy.findFirst({
            where: {
              id: request.strategyId,
              organizationId: workflowContext.organizationId,
              isDeleted: false,
              isActive: true,
              brandId: thread.brandId,
              userId: workflowContext.userId,
            },
            select: { id: true },
          })
        : null;
      if (
        !strategy ||
        !['proactive', 'campaign'].includes(String(metadata.source)) ||
        metadata.strategyId !== strategy.id ||
        (metadata.source === 'proactive' &&
          (request.source !== 'proactive' ||
            thread.agentStrategyId !== strategy.id))
      ) {
        throw new Error(
          'Agent execution limits require a trusted internal scoped strategy',
        );
      }
      if (request.creditBudget === 0)
        throw new Error('Agent credit budget is exhausted');
    }
    const state: PreparedAgentTurnState = {
      executionId: workflowContext.executionId,
      organizationId: workflowContext.organizationId,
      request,
      threadId: request.threadId,
      userId: workflowContext.userId,
      ...(request.campaignId ? { campaignId: request.campaignId } : {}),
      ...(request.strategyId ? { strategyId: request.strategyId } : {}),
    };
    return {
      brandId: thread.brandId,
      contextVersion: Number(thread.contextVersion ?? 1),
      state,
      threadId: request.threadId,
    };
  }

  private async runPreparedTurn(input: {
    context: AgentChatContext;
    generationPriority: ResolvedAgentExecutionPolicy['generationPriority'];
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    request: AgentChatRequest & { threadId: string };
    resolved: Awaited<
      ReturnType<
        AgentTurnWorkflowExecutionService['contextService']['resolveSystemPromptAndModel']
      >
    >;
    seedTitle: string;
    startedAt: string;
    state: PreparedAgentTurnState;
    turnCost: number;
  }): Promise<void> {
    const {
      context,
      generationPriority,
      model,
      policy,
      request,
      resolved,
      seedTitle,
      startedAt,
      state,
      turnCost,
    } = input;
    const host = {
      maybeUpdateThreadTitle: (params: {
        context: AgentChatContext;
        seedTitle: string;
        threadId: string;
        title: string | null;
      }) =>
        maybeUpdateThreadTitle({
          ...params,
          agentThreadsService: this.agentThreadsService,
        }),
    };
    const handledPlanMode =
      request.source !== 'proactive' &&
      request.creditBudget === undefined &&
      (await this.planModeService.tryHandlePlanModeTurnStream(
        {
          context,
          model,
          request,
          resolvedMemories: resolved.memories ?? [],
          seedTitle,
          startedAt,
          systemPromptOverride: resolved.systemPrompt,
          threadId: state.threadId,
          turnCost,
        },
        host,
      ));
    if (handledPlanMode) return;
    const handledDeterministically =
      request.source !== 'proactive' &&
      request.creditBudget === undefined &&
      ((await this.batchService.tryHandleBatchGenerationTurnStream(
        {
          context,
          model,
          policy,
          requestContent: request.content,
          seedTitle,
          startedAt,
          threadId: state.threadId,
        },
        host,
      )) ||
        (await this.recurringTaskService.tryHandleRecurringTaskDraftTurnStream({
          context,
          model,
          requestContent: request.content,
          seedTitle,
          startedAt,
          threadId: state.threadId,
        })));
    if (handledDeterministically) return;
    await this.publishTurnPhase(state, 'waiting_for_lane');
    await this.executionLaneService.runExclusive(state.threadId, () =>
      this.streamLoopService.runStreamLoop(
        context,
        state.threadId,
        resolved.systemPrompt,
        model,
        turnCost,
        policy,
        generationPriority,
        resolved.memories ?? [],
        request.agentType,
        request.source,
        seedTitle,
        startedAt,
        request.attachments,
      ),
    );
  }

  private async tryExecuteCadenceTurn(
    state: PreparedAgentTurnState,
  ): Promise<AgentTurnWorkflowResult | null> {
    if (
      state.request.source !== 'proactive' ||
      !state.strategyId ||
      !this.batchService.tryExecuteCadence
    )
      return null;
    return this.executionLaneService.runExclusive(state.threadId, () =>
      this.batchService.tryExecuteCadence(state),
    );
  }

  async execute(
    state: PreparedAgentTurnState,
  ): Promise<AgentTurnWorkflowResult> {
    const cadence = await this.tryExecuteCadenceTurn(state);
    if (cadence) return cadence;
    let request = state.request;
    const baseContext = this.buildBaseContext(state);
    const mediaResult = await this.tryExecuteMediaTurn(state, baseContext);
    if (mediaResult) {
      return mediaResult;
    }
    await this.publishTurnPhase(state, 'preparing');
    const userSettings = await this.settingsService.findOne({
      userId: state.userId,
    });
    // Chat has no user-facing model picker: the resolver below always
    // returns the Admin text catalog default unless a strategy or thinking
    // override applies. request.model is never read for that decision.
    const resolved = await this.contextService.resolveSystemPromptAndModel(
      request,
      baseContext,
    );
    if (!resolved.preparedScope.existingScope) {
      throw new InternalServerErrorException(
        'Unable to resolve server-authoritative agent scope.',
      );
    }
    const scope = resolved.preparedScope.existingScope;
    // Already free-tier locked by the context service's resolution chokepoint.
    const model = resolved.model;
    request = { ...request, model };
    const turnCost =
      request.agentType === AgentType.BRAND_INTERVIEW
        ? 0
        : await this.agentChatModelRegistry.getRoundCredits(model);
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        state.organizationId,
        turnCost,
      );
    if (!hasCredits) {
      throw new Error(
        `Insufficient credits. You need at least ${turnCost} credits for ${model}.`,
      );
    }
    const generationPriority = state.strategyId
      ? resolved.policy.generationPriority
      : (toRouterPriority(userSettings?.generationPriority) ??
        resolved.policy.generationPriority);
    const policy: ResolvedAgentExecutionPolicy = {
      ...resolved.policy,
      ...(baseContext.autonomyMode
        ? { autonomyMode: baseContext.autonomyMode }
        : {}),
      brandId: scope.brandId,
      scope,
    };
    const context: AgentChatContext = {
      ...baseContext,
      generationPriority,
      generationSettings: request.generationSettings,
      generationEntry: parseGenerationEntry(request.generationEntry),
      hostSupportsApproval: request.hostSupportsApproval ?? true,
      ...(request.knowledgeSelection
        ? { knowledgeSelection: request.knowledgeSelection }
        : {}),
      resolvedSkills: resolved.resolvedSkills,
      scope,
    };
    const thread = await this.agentThreadsService.findOne({
      id: state.threadId,
      organizationId: state.organizationId,
    });
    // Name the thread from its first intent only. Counted before this turn's
    // user message is persisted; an empty seed disables model retitling.
    const isFirstTurn =
      (await this.agentMessagesService.countMessages(state.threadId)) === 0;
    const seedTitle = isFirstTurn
      ? String(thread?.title ?? buildSeedThreadTitle(request.content))
      : '';
    const startedAt = new Date().toISOString();

    await this.threadEventRecorder.recordThreadTurnRequested({
      content: request.content,
      context,
      model,
      runId: state.executionId,
      source: request.source,
      threadId: state.threadId,
    });
    await upsertRuntimeBinding(this.runtimeSessionService, {
      model,
      organizationId: state.organizationId,
      runId: state.executionId,
      status: 'running',
      threadId: state.threadId,
    });
    await this.agentMessagesService.addMessage({
      artifactReferences: request.artifactReferences,
      brandId: scope.brandId,
      content: request.content,
      id: state.executionId,
      metadata: {
        agentScope: toAgentScopeMetadata(scope),
        ...buildAgentRoutingMetadata({
          defaultModelKey:
            await this.agentChatModelRegistry.getDefaultModelKey(),
          model,
          prompt: request.content,
          source: request.source,
        }),
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
      organizationId: state.organizationId,
      role: AgentMessageRole.USER,
      room: state.threadId,
      userId: state.userId,
    });

    await this.runPreparedTurn({
      context,
      generationPriority,
      model,
      policy,
      request,
      resolved,
      seedTitle,
      startedAt,
      state,
      turnCost,
    });

    return this.readCompletedTurn(state.threadId, state.organizationId, model);
  }

  private buildBaseContext(state: PreparedAgentTurnState): AgentChatContext {
    return {
      ...(state.request.requestedSkillSlugs?.length
        ? { requestedSkillSlugs: state.request.requestedSkillSlugs }
        : {}),
      ...(state.request.creditBudget !== undefined
        ? { creditBudget: state.request.creditBudget }
        : {}),
      ...(state.request.autonomyMode
        ? { autonomyMode: state.request.autonomyMode }
        : {}),
      executionId: state.executionId,
      executionMode: 'background',
      generationEntry: parseGenerationEntry(state.request.generationEntry),
      organizationId: state.organizationId,
      userId: state.userId,
      ...(state.campaignId ? { campaignId: state.campaignId } : {}),
      ...(state.strategyId ? { strategyId: state.strategyId } : {}),
    };
  }

  private publishTurnPhase(
    state: PreparedAgentTurnState,
    phase: 'preparing' | 'waiting_for_lane',
  ): Promise<void> {
    return this.streamEffects.publishTurnPhase({
      organizationId: state.organizationId,
      phase,
      runId: state.executionId,
      threadId: state.threadId,
      timestamp: new Date().toISOString(),
      userId: state.userId,
    });
  }

  async executeUiAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
  ): Promise<AgentChatResult> {
    return announceUiActionRun({
      context,
      request,
      run: () =>
        this.uiActionService.handleThreadUiAction(request, context, {
          executeSynchronousChatLoop: (params) =>
            this.syncLoopService.executeSynchronousChatLoop(params),
          generatePlanModeResponse: (params) =>
            this.planModeService.generatePlanModeResponse(params, {
              maybeUpdateThreadTitle: (titleParams) =>
                maybeUpdateThreadTitle({
                  ...titleParams,
                  agentThreadsService: this.agentThreadsService,
                }),
            }),
          runInThreadLane: (threadId, run) =>
            this.executionLaneService.runExclusive(threadId, run),
        }),
      streamEffects: this.streamEffects,
      threadEventRecorder: this.threadEventRecorder,
    });
  }

  private async tryExecuteMediaTurn(
    state: PreparedAgentTurnState,
    context: AgentChatContext,
  ): Promise<AgentTurnWorkflowResult | null> {
    if (
      state.request.source === 'proactive' ||
      state.request.creditBudget !== undefined
    )
      return null;
    const generationMode = resolveAgentTurnGenerationMode({
      generationMode: state.request.generationMode,
      prompt: state.request.content,
    });
    if (!isExplicitAgentMediaGenerationMode(generationMode)) {
      return null;
    }
    const settings = state.request.generationSettings;
    const sourceActionId = await persistComposerGenerationSource(
      state,
      generationMode,
      this.agentThreadsService,
      this.agentMessagesService,
    );
    const result = await this.executeUiAction(
      {
        action: 'confirm_generate_media',
        ...(state.request.brandId !== undefined
          ? { brandId: state.request.brandId }
          : {}),
        ...(state.request.expectedContextVersion !== undefined
          ? { expectedContextVersion: state.request.expectedContextVersion }
          : {}),
        payload: {
          ...(settings?.aspectRatio
            ? { aspectRatio: settings.aspectRatio }
            : {}),
          ...(settings?.duration !== undefined
            ? { duration: settings.duration }
            : {}),
          generationType: generationMode,
          ...(settings?.model ? { model: settings.model } : {}),
          ...(settings?.outputs !== undefined
            ? { outputs: settings.outputs }
            : {}),
          ...(settings?.prioritize ? { prioritize: settings.prioritize } : {}),
          prompt: state.request.content,
          ...(state.request.requestedSkillSlugs?.length
            ? { requestedSkillSlugs: state.request.requestedSkillSlugs }
            : {}),
          ...(settings?.resolution ? { resolution: settings.resolution } : {}),
          sourceActionId,
        },
        threadId: state.threadId,
      },
      context,
    );
    const metadata = readRecord(result.message.metadata);
    const content = result.message.content;
    return {
      artifactReferences: Array.isArray(metadata.artifactReferences)
        ? metadata.artifactReferences
        : [],
      artifactVersionPinIds: Array.isArray(metadata.artifactVersionPinIds)
        ? metadata.artifactVersionPinIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
      content,
      creditsUsed: result.creditsUsed,
      model: null,
      summary: content.slice(0, 500),
      threadId: result.threadId,
    };
  }

  async resumeInput(params: {
    answer: string;
    executionId: string;
    fieldId?: string;
    organizationId: string;
    scope: ValidatedAgentScope;
    threadId: string;
    userId: string;
  }): Promise<boolean> {
    return this.recurringTaskService.resumeRecurringTaskDraftFromInput(params);
  }

  async recordFailure(params: {
    error: string;
    executionId: string;
    organizationId: string;
    threadId?: string;
    userId: string;
  }): Promise<void> {
    if (!params.threadId) return;
    const context: AgentChatContext = {
      executionId: params.executionId,
      organizationId: params.organizationId,
      userId: params.userId,
    };
    await this.streamEffects.publishStreamFailure({
      context,
      error: params.error,
      threadId: params.threadId,
    });
  }

  private async readCompletedTurn(
    threadId: string,
    organizationId: string,
    fallbackModel: string,
  ): Promise<AgentTurnWorkflowResult> {
    const messages = await this.agentMessagesService.getMessagesByRoom(
      threadId,
      organizationId,
      { limit: 20 },
    );
    const assistant = messages.find(
      (message) => message.role === AgentMessageRole.ASSISTANT,
    );
    if (!assistant) {
      throw new Error('Agent turn completed without an assistant message');
    }
    const metadata = readRecord(assistant.metadata);
    const creditsUsed = Number(metadata.totalCreditsUsed ?? 0);
    const content = String(assistant.content ?? '');
    return {
      artifactReferences: Array.isArray(assistant.artifactReferences)
        ? assistant.artifactReferences
        : [],
      artifactVersionPinIds: Array.isArray(assistant.artifactVersionPinIds)
        ? assistant.artifactVersionPinIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
      content,
      creditsUsed: Number.isFinite(creditsUsed) ? Math.trunc(creditsUsed) : 0,
      model:
        optionalString(metadata.actualModel) ??
        optionalString(metadata.resolvedModel) ??
        fallbackModel,
      summary: content.slice(0, 500),
      threadId,
    };
  }
}
