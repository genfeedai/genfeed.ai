import {
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
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  type OnModuleInit,
} from '@nestjs/common';
import { AgentMessagesService } from '@server/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@server/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { SettingsService } from '@server/collections/settings/services/settings.service';
import { AGENT_RUNTIME_ACTION_IDS } from '@server/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { runEffectPromise } from '@server/helpers/utils/effect/effect.util';
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
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
  AgentGenerationSettings,
  AgentThreadUiActionRequest,
} from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@server/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { buildAgentRoutingMetadata } from '@server/services/agent-orchestrator/utils/agent-routing-policy.util';
import {
  buildSeedThreadTitle,
  maybeUpdateThreadTitle,
} from '@server/services/agent-orchestrator/utils/agent-thread-title.util';
import { AgentExecutionLaneService } from '@server/services/agent-threading/services/agent-execution-lane.service';
import {
  AgentRuntimeSessionService,
  upsertRuntimeBindingEffect,
} from '@server/services/agent-threading/services/agent-runtime-session.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

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

type AgentTurnWorkflowRequest = AgentChatRequest & {
  campaignId?: string;
  strategyId?: string;
};

const ARCHIVED_THREAD_WRITE_ERROR =
  'This thread is archived. Unarchive it before sending messages or running actions.';

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${field} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function projectGenerationSettings(
  value: unknown,
): AgentGenerationSettings | undefined {
  if (value === undefined) return undefined;
  const settings = readRecord(value);
  const aspectRatio = requiredString(
    settings.aspectRatio,
    'request.generationSettings.aspectRatio',
  ).trim();
  const prioritize = toRouterPriority(optionalString(settings.prioritize));
  if (settings.prioritize !== undefined && !prioritize) {
    throw new Error('request.generationSettings.prioritize is unsupported');
  }
  const duration = optionalNumber(
    settings.duration,
    'request.generationSettings.duration',
    1,
    60,
  );
  const model = optionalString(settings.model);
  const outputs = optionalNumber(
    settings.outputs,
    'request.generationSettings.outputs',
    1,
    8,
  );
  const resolution = optionalString(settings.resolution);
  return {
    aspectRatio,
    ...(duration !== undefined ? { duration } : {}),
    ...(model ? { model } : {}),
    ...(outputs !== undefined ? { outputs } : {}),
    ...(prioritize ? { prioritize } : {}),
    ...(resolution ? { resolution } : {}),
  };
}

function projectAgentTurnRequest(value: unknown): AgentTurnWorkflowRequest & {
  threadId: string;
} {
  const request = readRecord(value);
  const content = requiredString(request.content, 'request.content');
  const threadId = requiredString(request.threadId, 'request.threadId');
  const source = optionalString(request.source);
  if (source && !['agent', 'onboarding', 'proactive'].includes(source)) {
    throw new Error(`Unsupported agent request source: ${source}`);
  }
  const generationMode = optionalString(request.generationMode);
  if (generationMode && !['auto', 'image', 'video'].includes(generationMode)) {
    throw new Error(`Unsupported generation mode: ${generationMode}`);
  }
  return {
    content,
    threadId,
    ...(optionalString(request.agentType)
      ? { agentType: optionalString(request.agentType) as AgentType }
      : {}),
    ...(Array.isArray(request.artifactReferences)
      ? { artifactReferences: request.artifactReferences }
      : {}),
    ...(Array.isArray(request.attachments)
      ? { attachments: request.attachments }
      : {}),
    ...(request.brandId === null || typeof request.brandId === 'string'
      ? { brandId: request.brandId }
      : {}),
    ...(optionalString(request.campaignId)
      ? { campaignId: optionalString(request.campaignId) }
      : {}),
    ...(optionalString(request.clientRequestId)
      ? { clientRequestId: optionalString(request.clientRequestId) }
      : {}),
    ...(typeof request.expectedContextVersion === 'number'
      ? { expectedContextVersion: request.expectedContextVersion }
      : {}),
    ...(generationMode
      ? {
          generationMode: generationMode as AgentChatRequest['generationMode'],
        }
      : {}),
    ...(request.generationSettings !== undefined
      ? {
          generationSettings: projectGenerationSettings(
            request.generationSettings,
          ),
        }
      : {}),
    ...(optionalString(request.model)
      ? { model: optionalString(request.model) }
      : {}),
    ...(readRecord(request.pageContext) !== request.pageContext
      ? {}
      : { pageContext: readRecord(request.pageContext) }),
    ...(typeof request.planModeEnabled === 'boolean'
      ? { planModeEnabled: request.planModeEnabled }
      : {}),
    ...(source ? { source: source as AgentChatRequest['source'] } : {}),
    ...(optionalString(request.strategyId)
      ? { strategyId: optionalString(request.strategyId) }
      : {}),
    ...(optionalString(request.systemPromptOverride)
      ? { systemPromptOverride: optionalString(request.systemPromptOverride) }
      : {}),
    ...(optionalString(request.transferId)
      ? { transferId: optionalString(request.transferId) }
      : {}),
  };
}

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
        final: await this.execute(state),
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
      ({ context, input, provenance }) =>
        this.executeUiAction(
          readRecord(input.request) as unknown as AgentThreadUiActionRequest,
          {
            executionId: provenance.executionId,
            organizationId: context.organizationId,
            userId: context.userId,
          },
        ),
    );
    registerAction(
      AGENT_RUNTIME_ACTION_IDS.INPUT_RESPONSE,
      ({ context, input, provenance }) => {
        const request = readRecord(input.request);
        return this.resumeInput({
          answer: requiredString(request.answer, 'request.answer'),
          executionId: provenance.executionId,
          ...(optionalString(request.fieldId)
            ? { fieldId: optionalString(request.fieldId) }
            : {}),
          organizationId: context.organizationId,
          scope: readRecord(request.scope) as unknown as ValidatedAgentScope,
          threadId: requiredString(request.threadId, 'request.threadId'),
          userId: context.userId,
        });
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
      select: { brandId: true, contextVersion: true, status: true },
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

  async execute(
    state: PreparedAgentTurnState,
  ): Promise<AgentTurnWorkflowResult> {
    let request = state.request;
    const baseContext: AgentChatContext = {
      executionId: state.executionId,
      executionMode: 'background',
      organizationId: state.organizationId,
      userId: state.userId,
      ...(state.campaignId ? { campaignId: state.campaignId } : {}),
      ...(state.strategyId ? { strategyId: state.strategyId } : {}),
    };
    if (
      request.generationMode === 'image' ||
      request.generationMode === 'video'
    ) {
      return this.executeExplicitMediaGeneration(state, baseContext);
    }
    const userSettings = await this.settingsService.findOne({
      userId: state.userId,
    });
    // Chat has no user-facing model picker: the resolver below always
    // returns the pinned catalogue default unless a strategy, thinking
    // override, or agent-type default applies. request.model is never
    // read for that decision.
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
    const model =
      resolved.model ??
      (await this.agentChatModelRegistry.getDefaultModelKey());
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
      brandId: scope.brandId,
      scope,
    };
    const context: AgentChatContext = {
      ...baseContext,
      generationPriority,
      generationSettings: request.generationSettings,
      resolvedSkills: resolved.resolvedSkills,
      scope,
    };
    const thread = await this.agentThreadsService.findOne({
      id: state.threadId,
      organizationId: state.organizationId,
    });
    const seedTitle = String(
      thread?.title ?? buildSeedThreadTitle(request.content),
    );
    const startedAt = new Date().toISOString();

    await this.threadEventRecorder.recordThreadTurnRequested({
      content: request.content,
      context,
      model,
      runId: state.executionId,
      source: request.source,
      threadId: state.threadId,
    });
    await runEffectPromise(
      upsertRuntimeBindingEffect(this.runtimeSessionService, {
        model,
        organizationId: state.organizationId,
        runId: state.executionId,
        status: 'running',
        threadId: state.threadId,
      }),
    );
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
      await this.planModeService.tryHandlePlanModeTurnStream(
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
      );
    if (!handledPlanMode) {
      const handledDeterministically =
        (await this.batchService.tryHandleBatchGenerationTurnStream(
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
        }));
      if (!handledDeterministically) {
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
    }

    return this.readCompletedTurn(state.threadId, state.organizationId, model);
  }

  async executeUiAction(
    request: AgentThreadUiActionRequest,
    context: AgentChatContext,
  ): Promise<AgentChatResult> {
    return this.uiActionService.handleThreadUiAction(request, context, {
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
    });
  }

  private async executeExplicitMediaGeneration(
    state: PreparedAgentTurnState,
    context: AgentChatContext,
  ): Promise<AgentTurnWorkflowResult> {
    const settings = state.request.generationSettings;
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
          generationType: state.request.generationMode,
          ...(settings?.model ? { model: settings.model } : {}),
          ...(settings?.outputs !== undefined
            ? { outputs: settings.outputs }
            : {}),
          ...(settings?.prioritize ? { prioritize: settings.prioritize } : {}),
          prompt: state.request.content,
          ...(settings?.resolution ? { resolution: settings.resolution } : {}),
          sourceActionId: `composer-generation:${state.executionId}`,
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
    await runEffectPromise(
      this.streamEffects.publishStreamFailureEffect({
        context,
        error: params.error,
        failRun: false,
        threadId: params.threadId,
      }),
    );
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
