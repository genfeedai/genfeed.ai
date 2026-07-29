import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
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
import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorPlanModeService } from '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service';
import { AgentOrchestratorRecurringTaskService } from '@api/services/agent-orchestrator/agent-orchestrator-recurring-task.service';
import { AgentOrchestratorUiActionService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import {
  type AgentToolRoundState,
  AgentTurnRoundRunnerService,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import {
  AGENT_MAX_TOOL_ROUNDS,
  getAgentTurnCost,
} from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import {
  DEFAULT_AGENT_CHAT_MODEL,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL,
} from '@api/services/agent-orchestrator/constants/agent-default-model.constant';
import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
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
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { getToolDefinitions } from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import {
  captureRunArtifacts,
  mergeAgentArtifactCompletionMetadata,
  persistRunArtifacts,
} from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { extractBatchTopic } from '@api/services/agent-orchestrator/utils/agent-orchestrator-input-parsing.util';
import { buildPageContextPrompt } from '@api/services/agent-orchestrator/utils/agent-page-context.util';
import {
  buildAgentRoutingMetadata,
  resolveAgentRoutingPlugins,
  resolveAgentRoutingPolicy,
} from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import {
  buildAgentScopeMetadata,
  recordAgentRunScope,
  withAgentScopeResult,
} from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  applyAgentReplyStyle,
  buildAgentSystemPrompt,
} from '@api/services/agent-orchestrator/utils/agent-system-prompt.util';
import { settleAgentTurnCredits } from '@api/services/agent-orchestrator/utils/agent-turn-credit.util';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { AgentExecutionLaneService } from '@api/services/agent-threading/services/agent-execution-lane.service';
import { AgentProfileResolverService } from '@api/services/agent-threading/services/agent-profile-resolver.service';
import { AgentRuntimeSessionService } from '@api/services/agent-threading/services/agent-runtime-session.service';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { ThreadContextCompressorService } from '@api/services/agent-threading/services/thread-context-compressor.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type {
  OpenRouterMessage,
  OpenRouterPlugin,
  OpenRouterTool,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import {
  ActivitySource,
  AgentExecutionTrigger,
  AgentMessageRole,
  AgentType,
  SubscriptionTier,
} from '@genfeedai/enums';
import {
  AgentToolName,
  type AgentUIBlocksEvent,
  type AgentUiAction,
  toAgentScopeMetadata,
  type ValidatedAgentScope,
} from '@genfeedai/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/interfaces/ai';
import {
  AgentScopeContextService,
  type PreparedAgentScope,
} from '@genfeedai/server';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { Effect } from 'effect';

const PAID_SUBSCRIPTION_TIERS = new Set<string>([
  SubscriptionTier.PRO,
  SubscriptionTier.SCALE,
  SubscriptionTier.ENTERPRISE,
]);

// During live token streaming, cancellation cannot be checked per token
// (isRunCancelled is a Redis lookup); throttle it to at most once per this
// interval so a cancelled run tears down the upstream stream promptly without
// a lookup on every delta.
const STREAM_CANCEL_CHECK_INTERVAL_MS = 750;
// Per-token publish failures are swallowed to avoid aborting a live stream on a
// transient Redis hiccup, but a sustained outage should be diagnosable — log at
// most once per this interval per turn instead of once per dropped token.
const STREAM_PUBLISH_LOG_INTERVAL_MS = 5_000;

// Thrown from the streaming onToken callback when the run has been cancelled.
// It unwinds the provider's for-await loop (tearing down the upstream HTTP/SDK
// stream) and is caught at the dispatch site, which routes it to the
// cancelled-stream handler rather than treating it as a generation error.
class StreamCancelledError extends Error {
  constructor() {
    super('agent stream cancelled');
    this.name = 'StreamCancelledError';
  }
}

@Injectable()
export class AgentOrchestratorService {
  private readonly constructorName = String(this.constructor.name);
  private readonly activeStreams = new Set<string>();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentScopeContextService: AgentScopeContextService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly turnRoundRunner: AgentTurnRoundRunnerService,
    private readonly uiActionService: AgentOrchestratorUiActionService,
    private readonly recurringTaskService: AgentOrchestratorRecurringTaskService,
    private readonly planModeService: AgentOrchestratorPlanModeService,
    private readonly batchService: AgentOrchestratorBatchService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly settingsService: SettingsService,
    private readonly streamEffects: AgentStreamEffectsService,
    private readonly agentRunsService: AgentRunsService,
    @Optional()
    private readonly agentMessageBusService?: AgentMessageBusService,
    @Optional()
    private readonly agentCampaignsService?: AgentCampaignsService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
    @Optional()
    private readonly agentRuntimeSessionService?: AgentRuntimeSessionService,
    @Optional()
    private readonly agentExecutionLaneService?: AgentExecutionLaneService,
    @Optional()
    private readonly agentProfileResolverService?: AgentProfileResolverService,
    @Optional()
    private readonly threadContextCompressorService?: ThreadContextCompressorService,
    @Optional()
    private readonly skillRuntimeService?: SkillRuntimeService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  /**
   * Whether real token-by-token LLM streaming is enabled for agent chat.
   * Defaults to false (legacy simulated word-split streaming) when the flag or
   * ConfigService is unavailable, so behaviour is unchanged unless opted in.
   */
  private isRealTokenStreamingEnabled(): boolean {
    return this.configService?.get('AGENT_TOKEN_STREAMING_ENABLED') === 'true';
  }

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
          buildFallbackThreadTitle: (prompt) =>
            this.buildFallbackThreadTitle(prompt),
          maybeUpdateThreadTitle: (p) => this.maybeUpdateThreadTitle(p),
          sanitizeGeneratedThreadTitle: (title, prompt) =>
            this.sanitizeGeneratedThreadTitle(title, prompt),
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
        return this.executeSynchronousChatLoop({
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
        this.executeSynchronousChatLoop(params),
      generatePlanModeResponse: (params) =>
        this.planModeService.generatePlanModeResponse(params, {
          buildFallbackThreadTitle: (prompt) =>
            this.buildFallbackThreadTitle(prompt),
          maybeUpdateThreadTitle: (p) => this.maybeUpdateThreadTitle(p),
          sanitizeGeneratedThreadTitle: (title, prompt) =>
            this.sanitizeGeneratedThreadTitle(title, prompt),
        }),
      runInThreadLane: (threadId, run) => this.runInThreadLane(threadId, run),
    });
  }

  private async executeSynchronousChatLoop(params: {
    context: AgentChatContext;
    threadId: string;
    generationPriority: string;
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    turnCost: number;
  }): Promise<AgentChatResult> {
    const {
      context,
      threadId,
      generationPriority,
      model,
      policy,
      request,
      resolvedMemories,
      seedTitle,
      systemPromptOverride,
      turnCost,
    } = params;
    const toolRoundState: AgentToolRoundState = {
      artifactMetadata: [],
      highestRiskLevel: 'low',
      latestUiBlocks: null,
      reviewRequired: false,
      toolCalls: [],
      totalCreditsUsed: 0,
      uiActions: [],
    };

    await this.threadEventRecorder.recordThreadTurnStarted({
      context,
      model,
      runId: context.runId,
      source: request.source,
      threadId,
    });

    try {
      let resolvedSystemPrompt = systemPromptOverride;
      if (
        context.campaignId &&
        this.agentCampaignsService &&
        this.agentMessageBusService
      ) {
        resolvedSystemPrompt = await this.contextService.injectCampaignContext(
          context.campaignId,
          context.organizationId,
          resolvedSystemPrompt,
        );
      }

      const { messages: recentMessages, compressedContext } =
        await this.contextService.resolveThreadMessages(
          threadId,
          context.organizationId,
        );
      const history = this.contextService.buildMessageHistory(
        recentMessages,
        resolvedSystemPrompt,
        resolvedMemories,
        request.attachments,
        compressedContext,
      );
      const typeConfig = request.agentType
        ? getAgentTypeConfig(request.agentType)
        : null;
      // Merge skill tool overrides into the base tool set (additive).
      // When agentType is unset, pass undefined to preserve unrestricted toolset
      // instead of [] which would wipe all base tools.
      const syncBaseTools =
        this.skillRuntimeService && context.resolvedSkills?.length
          ? (this.skillRuntimeService.mergeSkillToolOverrides(
              typeConfig?.defaultTools,
              context.resolvedSkills,
            ) as AgentToolName[] | undefined)
          : typeConfig?.defaultTools;
      const tools = this.buildToolDefinitions(
        this.mergeAllowedTools(
          syncBaseTools,
          this.getRequestScopedAllowedTools(request.content),
        ),
      );
      const allowedToolNames = new Set(
        tools.map((tool) => tool.function.name as AgentToolName),
      );
      const messages = [...history];
      let round = 0;
      const actualModels = new Set<string>();

      while (round < AGENT_MAX_TOOL_ROUNDS) {
        round++;

        const response = await this.llmDispatcher.chatCompletion(
          this.buildAgentChatCompletionParams({
            messages,
            model,
            prompt: request.content,
            seedTitle,
            source: request.source,
            tools,
          }),
          context.organizationId,
        );
        const actualModel = await this.recordAgentResponseModel({
          actualModels: Array.from(actualModels),
          context,
          requestedModel: model,
          responseModel: response.model,
          runId: context.runId,
          source: request.source,
          threadId,
        });
        actualModels.add(actualModel);

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        const assistantMessage = choice.message;
        const toolCalls = assistantMessage.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
          const threadEnvelope = this.extractThreadEnvelope({
            assistantContent: sanitizeAgentOutputText(
              assistantMessage.content || '',
            ),
            prompt: request.content,
            seedTitle,
          });
          const normalizedContent = this.normalizeFinalAssistantContent(
            threadEnvelope.content,
            toolRoundState.toolCalls,
            toolRoundState.uiActions,
          );
          const content = normalizedContent.content;

          toolRoundState.totalCreditsUsed += await settleAgentTurnCredits({
            creditsUtilsService: this.creditsUtilsService,
            model,
            organizationId: context.organizationId,
            toolCalls: toolRoundState.toolCalls,
            turnCost,
            userId: context.userId,
          });

          await this.maybeUpdateThreadTitle({
            context,
            seedTitle,
            threadId,
            title: threadEnvelope.title,
          });

          const creditsRemaining =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              context.organizationId,
            );
          const memoryEntriesForResponse =
            this.contextService.buildMemoryEntriesForResponse(resolvedMemories);
          const memoryInfluence =
            this.contextService.buildMemoryInfluenceMetadata(resolvedMemories);
          const reasoning = assistantMessage.reasoning_content ?? null;
          const enhancedUiActions =
            this.completionCardBuilder.buildAssistantUiActions({
              reviewRequired: toolRoundState.reviewRequired,
              toolCalls: toolRoundState.toolCalls,
              uiActions: toolRoundState.uiActions,
            });
          const artifactMetadata = mergeAgentArtifactCompletionMetadata(
            toolRoundState.artifactMetadata,
          );
          const assistantMetadata = {
            ...artifactMetadata,
            ...buildAgentScopeMetadata(context),
            ...buildAgentRoutingMetadata({
              model,
              prompt: request.content,
              source: request.source,
            }),
            isFallbackContent: normalizedContent.isFallback,
            memoryEntries: memoryEntriesForResponse,
            memoryInfluence,
            ...this.buildResolvedModelMetadata(model, Array.from(actualModels)),
            reasoning,
            reviewRequired: toolRoundState.reviewRequired,
            riskLevel: toolRoundState.highestRiskLevel,
            ...(enhancedUiActions.suggestedActions.length
              ? { suggestedActions: enhancedUiActions.suggestedActions }
              : {}),
            totalCreditsUsed: toolRoundState.totalCreditsUsed,
            uiActions: enhancedUiActions.uiActions,
            ...(toolRoundState.latestUiBlocks
              ? { uiBlocks: toolRoundState.latestUiBlocks }
              : {}),
          };

          await persistRunArtifacts(
            this.agentRunsService,
            context,
            artifactMetadata,
          );
          await this.agentMessagesService.addMessage({
            brandId: context.scope?.brandId,
            content,
            metadata: {
              creditsRemaining,
              ...assistantMetadata,
              tokenUsage: response.usage
                ? {
                    completion: response.usage.completion_tokens,
                    prompt: response.usage.prompt_tokens,
                    total: response.usage.total_tokens,
                  }
                : undefined,
            },
            organizationId: context.organizationId,
            role: AgentMessageRole.ASSISTANT,
            room: threadId,
            toolCalls: toolRoundState.toolCalls.map((tc) => ({
              creditsUsed: tc.creditsUsed,
              durationMs: tc.durationMs,
              error: tc.error,
              parameters: tc.parameters ?? {},
              result: tc.resultSummary ? { summary: tc.resultSummary } : {},
              status: tc.status,
              toolName: tc.toolName,
            })),
            userId: context.userId,
          });
          await this.threadEventRecorder.recordAssistantFinalized({
            content,
            context,
            metadata: assistantMetadata,
            runId: context.runId,
            threadId,
          });
          await this.threadEventRecorder.recordRunCompleted({
            context,
            detail: 'Agent completed',
            runId: context.runId,
            threadId,
          });

          return {
            creditsRemaining,
            creditsUsed: toolRoundState.totalCreditsUsed,
            message: {
              content,
              metadata: assistantMetadata,
              role: 'assistant',
            },
            threadId,
            toolCalls: toolRoundState.toolCalls,
          };
        }

        await this.turnRoundRunner.executeToolRound({
          allowedToolNames,
          assistantContent: assistantMessage.content,
          attachmentUrls: request.attachments?.map((a) => a.url),
          context,
          generationPriority,
          messages,
          model,
          policy,
          source: request.source,
          state: toolRoundState,
          strategy: {
            logParseErrors: true,
            onRecordRunToolCall: (summary) => {
              if (!context.runId) {
                return;
              }
              this.agentRunsService
                .recordToolCall(context.runId, context.organizationId, summary)
                .catch(() => undefined);
            },
            onToolCompleted: async (event) => {
              await this.threadEventRecorder.recordToolCompleted({
                context,
                durationMs: event.durationMs,
                error: event.summary.error,
                runId: context.runId,
                status: event.summary.status,
                threadId,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              });
            },
            onToolStarted: async (event) => {
              await this.threadEventRecorder.recordToolStarted({
                context,
                parameters: event.parameters,
                runId: context.runId,
                threadId,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              });
            },
            onUiBlocks: async (event) => {
              await this.threadEventRecorder.recordUiBlocksUpdated({
                blockIds: event.blockIds,
                blocks: event.blocks,
                context,
                operation: event.operation,
                runId: context.runId,
                threadId,
              });
            },
          },
          thinkingModel: policy.thinkingModelOverride ?? model,
          threadId,
          toolCalls,
        });
      }

      throw new Error(
        `Agent exceeded maximum tool-calling rounds (${AGENT_MAX_TOOL_ROUNDS})`,
      );
    } catch (error: unknown) {
      await this.threadEventRecorder.recordRunFailed({
        context,
        error: error instanceof Error ? error.message : 'Unknown error',
        runId: context.runId,
        threadId,
      });
      throw error;
    }
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
          buildFallbackThreadTitle: (prompt) =>
            this.buildFallbackThreadTitle(prompt),
          maybeUpdateThreadTitle: (p) => this.maybeUpdateThreadTitle(p),
          sanitizeGeneratedThreadTitle: (title, prompt) =>
            this.sanitizeGeneratedThreadTitle(title, prompt),
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
            buildFallbackThreadTitle: (prompt) =>
              this.buildFallbackThreadTitle(prompt),
            maybeUpdateThreadTitle: (p) => this.maybeUpdateThreadTitle(p),
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
      await this.runStreamLoop(
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

  private async runStreamLoop(
    context: AgentChatContext,
    threadId: string,
    systemPromptOverride: string | undefined,
    model: string,
    turnCost: number,
    resolvedPolicy: ResolvedAgentExecutionPolicy,
    generationPriority: string,
    memoryEntries: AgentMemoryDocument[],
    agentType?: AgentType,
    source?: AgentChatRequest['source'],
    seedTitle?: string,
    runStartedAt?: string,
    attachments?: AgentChatAttachment[],
  ): Promise<void> {
    this.activeStreams.add(threadId);

    try {
      await runEffectPromise(
        this.streamEffects.publishStreamLifecycleStartedEffect({
          context,
          model,
          startedAt: runStartedAt,
          threadId,
        }),
      );

      const toolRoundState: AgentToolRoundState = {
        artifactMetadata: [],
        highestRiskLevel: 'low',
        latestUiBlocks: null,
        reviewRequired: false,
        toolCalls: [],
        totalCreditsUsed: 0,
        uiActions: [],
      };
      const memoryEntriesForResponse =
        this.contextService.buildMemoryEntriesForResponse(memoryEntries);
      const memoryInfluence =
        this.contextService.buildMemoryInfluenceMetadata(memoryEntries);

      // Build thread history from separate messages collection
      const {
        messages: recentMessages,
        compressedContext: streamCompressedCtx,
      } = await this.contextService.resolveThreadMessages(
        threadId,
        context.organizationId,
      );
      const history = this.contextService.buildMessageHistory(
        recentMessages,
        systemPromptOverride,
        memoryEntries,
        attachments,
        streamCompressedCtx,
      );
      const typeConfig = agentType ? getAgentTypeConfig(agentType) : null;
      // Merge skill tool overrides into the base tool set (additive).
      // When agentType is unset, pass undefined to preserve unrestricted toolset
      // instead of [] which would wipe all base tools.
      const baseTools =
        this.skillRuntimeService && context.resolvedSkills?.length
          ? (this.skillRuntimeService.mergeSkillToolOverrides(
              typeConfig?.defaultTools,
              context.resolvedSkills,
            ) as AgentToolName[] | undefined)
          : typeConfig?.defaultTools;
      const latestUserMessage =
        [...history]
          .reverse()
          .find((message) => message.role === 'user')
          ?.content?.toString?.() ?? '';
      const scopedTools = this.getRequestScopedAllowedTools(latestUserMessage);
      const tools = this.buildToolDefinitions(
        this.mergeAllowedTools(baseTools, scopedTools),
      );
      const allowedToolNames = new Set(
        tools.map((tool) => tool.function.name as AgentToolName),
      );
      const messages = [...history];
      let round = 0;
      const actualModels = new Set<string>();

      // Real token streaming is skipped for title-seeding turns (seedTitle set,
      // first message of a new thread) because the model returns a JSON
      // {title, content} envelope there — streaming raw deltas would flash JSON
      // at the user. Those turns keep the simulated word-split path.
      const canStreamLiveTokens =
        this.isRealTokenStreamingEnabled() && !(seedTitle ?? '').trim();

      while (round < AGENT_MAX_TOOL_ROUNDS) {
        if (await this.isRunCancelled(context)) {
          await this.handleCancelledStream(context, threadId);
          return;
        }
        round++;

        const chatParams = this.buildAgentChatCompletionParams({
          messages,
          model,
          prompt: latestUserMessage,
          seedTitle: seedTitle ?? '',
          source,
          tools,
        });

        // Real deltas published live during this round; drives whether the
        // final branch re-simulates word-split streaming or not.
        let roundStreamedTokenCount = 0;
        let lastCancelCheckAt = 0;
        let lastPublishErrorLoggedAt = 0;

        const onStreamToken = async (delta: string): Promise<void> => {
          roundStreamedTokenCount++;

          // Throttled cancellation check — unwinds the provider stream (and its
          // upstream connection) instead of burning the whole generation after
          // the user has already stopped the run.
          const now = Date.now();
          if (now - lastCancelCheckAt >= STREAM_CANCEL_CHECK_INTERVAL_MS) {
            lastCancelCheckAt = now;
            if (await this.isRunCancelled(context)) {
              throw new StreamCancelledError();
            }
          }

          await runEffectPromise(
            this.streamEffects
              .publishStreamTokenEffect({
                runId: context.runId,
                threadId,
                token: delta,
                userId: context.userId,
              })
              .pipe(
                // Keep swallowing publish failures (a transient Redis hiccup must
                // not abort a live stream) but surface a throttled log so a
                // sustained outage is diagnosable rather than silent.
                Effect.tapError((error) =>
                  Effect.sync(() => {
                    const errorAt = Date.now();
                    if (
                      errorAt - lastPublishErrorLoggedAt >=
                      STREAM_PUBLISH_LOG_INTERVAL_MS
                    ) {
                      lastPublishErrorLoggedAt = errorAt;
                      this.loggerService.warn(
                        `${this.constructorName} stream token publish failed (throttled)`,
                        {
                          error:
                            error instanceof Error
                              ? error.message
                              : String(error),
                          threadId,
                        },
                      );
                    }
                  }),
                ),
                Effect.catchAll(() => Effect.void),
              ),
          );
        };

        // IIFE so a mid-stream cancellation (StreamCancelledError thrown from
        // onStreamToken) is caught here and routed to the cancelled-stream
        // handler; any other error still propagates as a real failure.
        const response = await (async () => {
          try {
            return canStreamLiveTokens
              ? await this.llmDispatcher.streamChatCompletionAggregated(
                  chatParams,
                  context.organizationId,
                  onStreamToken,
                )
              : await this.llmDispatcher.chatCompletion(
                  chatParams,
                  context.organizationId,
                );
          } catch (error) {
            if (error instanceof StreamCancelledError) {
              return null;
            }
            throw error;
          }
        })();

        if (!response) {
          await this.handleCancelledStream(context, threadId);
          return;
        }
        const actualModel = await this.recordAgentResponseModel({
          actualModels: Array.from(actualModels),
          context,
          requestedModel: model,
          responseModel: response.model,
          runId: context.runId,
          source,
          threadId,
        });
        actualModels.add(actualModel);

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        const assistantMessage = choice.message;
        const toolCalls = assistantMessage.tool_calls;

        // No tool calls — final response
        if (!toolCalls || toolCalls.length === 0) {
          if (await this.isRunCancelled(context)) {
            await this.handleCancelledStream(context, threadId);
            return;
          }

          const threadEnvelope = this.extractThreadEnvelope({
            assistantContent: sanitizeAgentOutputText(
              assistantMessage.content || '',
            ),
            prompt: latestUserMessage,
            seedTitle: seedTitle ?? '',
          });
          const normalizedContent = this.normalizeFinalAssistantContent(
            threadEnvelope.content,
            toolRoundState.toolCalls,
            toolRoundState.uiActions,
          );
          const content = normalizedContent.content;

          toolRoundState.totalCreditsUsed += await settleAgentTurnCredits({
            creditsUtilsService: this.creditsUtilsService,
            model,
            organizationId: context.organizationId,
            toolCalls: toolRoundState.toolCalls,
            turnCost,
            userId: context.userId,
          });

          await this.maybeUpdateThreadTitle({
            context,
            seedTitle: seedTitle ?? '',
            threadId,
            title: threadEnvelope.title,
          });

          const creditsRemaining =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              context.organizationId,
            );
          const reasoning = assistantMessage.reasoning_content ?? null;

          await runEffectPromise(
            this.streamEffects.publishStreamAssistantResponseEffect({
              content,
              context,
              reasoning,
              // When this round already streamed real deltas live, don't
              // re-emit the content as simulated word-split tokens.
              suppressTokenStreaming: roundStreamedTokenCount > 0,
              threadId,
            }),
          );

          const enhancedUiActions =
            this.completionCardBuilder.buildAssistantUiActions({
              reviewRequired: toolRoundState.reviewRequired,
              toolCalls: toolRoundState.toolCalls,
              uiActions: toolRoundState.uiActions,
            });
          const artifactMetadata = mergeAgentArtifactCompletionMetadata(
            toolRoundState.artifactMetadata,
          );

          // Save assistant message to DB
          await persistRunArtifacts(
            this.agentRunsService,
            context,
            artifactMetadata,
          );
          await this.agentMessagesService.addMessage({
            brandId: context.scope?.brandId,
            content,
            metadata: {
              ...artifactMetadata,
              ...buildAgentScopeMetadata(context),
              ...buildAgentRoutingMetadata({
                model,
                prompt: latestUserMessage,
                source,
              }),
              creditsRemaining,
              isFallbackContent: normalizedContent.isFallback,
              memoryEntries: memoryEntriesForResponse,
              memoryInfluence,
              ...this.buildResolvedModelMetadata(
                model,
                Array.from(actualModels),
              ),
              reasoning,
              reviewRequired: toolRoundState.reviewRequired,
              riskLevel: toolRoundState.highestRiskLevel,
              ...(enhancedUiActions.suggestedActions.length
                ? { suggestedActions: enhancedUiActions.suggestedActions }
                : {}),
              tokenUsage: response.usage
                ? {
                    completion: response.usage.completion_tokens,
                    prompt: response.usage.prompt_tokens,
                    total: response.usage.total_tokens,
                  }
                : undefined,
              totalCreditsUsed: toolRoundState.totalCreditsUsed,
              uiActions: enhancedUiActions.uiActions,
            },
            organizationId: context.organizationId,
            role: AgentMessageRole.ASSISTANT,
            room: threadId,
            toolCalls: toolRoundState.toolCalls.map((tc) => ({
              creditsUsed: tc.creditsUsed,
              durationMs: tc.durationMs,
              error: tc.error,
              parameters: tc.parameters ?? {},
              result: tc.resultSummary ? { summary: tc.resultSummary } : {},
              status: tc.status,
              toolName: tc.toolName,
            })),
            userId: context.userId,
          });

          let runDurationMs: number | undefined;
          if (context.runId) {
            const completedRun = await this.agentRunsService.complete(
              context.runId,
              context.organizationId,
              content.slice(0, 200),
            );
            runDurationMs =
              typeof completedRun?.durationMs === 'number'
                ? completedRun.durationMs
                : undefined;
          }

          await runEffectPromise(
            this.streamEffects.publishStreamCompletionEffect({
              completionMetadata: {
                isFallbackContent: normalizedContent.isFallback,
                memoryEntries: memoryEntriesForResponse,
                memoryInfluence,
                ...this.buildResolvedModelMetadata(
                  model,
                  Array.from(actualModels),
                ),
                reasoning,
                reviewRequired: toolRoundState.reviewRequired,
                riskLevel: toolRoundState.highestRiskLevel,
                ...(enhancedUiActions.suggestedActions.length
                  ? { suggestedActions: enhancedUiActions.suggestedActions }
                  : {}),
                totalCreditsUsed: toolRoundState.totalCreditsUsed,
                uiActions: enhancedUiActions.uiActions,
                ...(toolRoundState.latestUiBlocks
                  ? { uiBlocks: toolRoundState.latestUiBlocks }
                  : {}),
              },
              content,
              context,
              creditsRemaining,
              creditsUsed: toolRoundState.totalCreditsUsed,
              durationMs: runDurationMs,
              runStartedAt,
              threadId,
              toolCalls: toolRoundState.toolCalls,
            }),
          );

          return;
        }

        // Has tool calls — shared runner (stream strategy: SSE + cancel)
        const toolRoundResult = await this.turnRoundRunner.executeToolRound({
          allowedToolNames,
          assistantContent: assistantMessage.content,
          attachmentUrls: attachments?.map((a) => a.url),
          context,
          generationPriority,
          messages,
          model,
          policy: resolvedPolicy,
          source,
          state: toolRoundState,
          strategy: {
            deferUnknownToolFailure: true,
            logParseErrors: false,
            onAfterTool: async () =>
              (await this.isRunCancelled(context)) ? 'cancel' : 'continue',
            onBeforeTool: async () =>
              (await this.isRunCancelled(context)) ? 'cancel' : 'continue',
            onToolCompleted: async (event) => {
              if (event.kind === 'unknown') {
                await runEffectPromise(
                  this.streamEffects.publishStreamingToolCompletedEffect({
                    context,
                    debug: {
                      error: event.summary.error,
                      parameters: event.parameters,
                    },
                    detail: event.summary.error,
                    durationMs: event.summary.durationMs,
                    error: event.summary.error,
                    label: event.requestedToolName,
                    parameters: event.parameters,
                    resultSummary: event.summary.error,
                    status: 'failed',
                    threadId,
                    toolCallId: event.toolCallId,
                    toolName: event.requestedToolName,
                  }),
                );
                return;
              }

              if (event.kind === 'insufficient_credits') {
                await runEffectPromise(
                  this.streamEffects.publishStreamingToolCompletedEffect({
                    context,
                    debug: {
                      error: event.summary.error,
                      parameters: event.parameters,
                    },
                    detail: event.summary.error,
                    durationMs: event.summary.durationMs,
                    error: event.summary.error,
                    parameters: event.parameters,
                    resultSummary: event.summary.error,
                    status: 'failed',
                    threadId,
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                  }),
                );
                return;
              }

              await runEffectPromise(
                this.streamEffects.publishStreamingToolCompletedEffect({
                  context,
                  creditsUsed: event.summary.creditsUsed,
                  debug: event.summary.error
                    ? {
                        error: event.summary.error,
                        parameters: event.parameters,
                        result: event.result?.data,
                      }
                    : {
                        parameters: event.parameters,
                        result: event.result?.data,
                      },
                  detail:
                    event.summary.status === 'completed'
                      ? (event.summary.resultSummary ??
                        `${event.toolName} completed`)
                      : event.summary.error,
                  durationMs: event.durationMs,
                  error: event.summary.error,
                  parameters: event.parameters,
                  resultSummary: event.summary.resultSummary,
                  status: event.summary.status,
                  threadId,
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  uiActions: event.result?.nextActions,
                }),
              );
            },
            onToolStarted: async (event) => {
              await runEffectPromise(
                this.streamEffects.publishStreamingToolStartedEffect({
                  context,
                  parameters: event.parameters,
                  startedAt: new Date(event.startTime).toISOString(),
                  threadId,
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                }),
              );
            },
            onUiBlocks: async (event) => {
              if (event.deferPublish) {
                return;
              }
              await runEffectPromise(
                this.streamEffects.publishStreamUiBlocksEffect({
                  blockIds: event.blockIds,
                  blocks: event.blocks as AgentUIBlocksEvent['blocks'],
                  context,
                  operation: event.operation,
                  runId: context.runId,
                  threadId,
                }),
              );
            },
          },
          thinkingModel: resolvedPolicy.thinkingModelOverride ?? undefined,
          threadId,
          toolCalls,
        });

        if (toolRoundResult.isCancelled) {
          await this.handleCancelledStream(context, threadId);
          return;
        }
      }

      const errorMsg = `Agent exceeded maximum tool-calling rounds (${AGENT_MAX_TOOL_ROUNDS})`;
      await runEffectPromise(
        this.streamEffects.publishStreamFailureEffect({
          context,
          error: errorMsg,
          failRun: true,
          threadId,
        }),
      );
    } catch (error: unknown) {
      if (await this.isRunCancelled(context)) {
        await this.handleCancelledStream(context, threadId);
        return;
      }

      await runEffectPromise(
        this.streamEffects.publishStreamFailureEffect({
          context,
          error: error instanceof Error ? error.message : 'Unknown error',
          failRun: true,
          threadId,
        }),
      );

      this.loggerService.error(
        `${this.constructorName} streaming chat failed`,
        {
          error: error instanceof Error ? error.message : error,
          organizationId: context.organizationId,
          userId: context.userId,
        },
      );
    } finally {
      this.activeStreams.delete(threadId);
    }
  }

  private async isRunCancelled(context: AgentChatContext): Promise<boolean> {
    if (!context.runId) {
      return false;
    }

    return await this.agentRunsService.isCancelled(
      context.runId,
      context.organizationId,
    );
  }

  private async handleCancelledStream(
    context: AgentChatContext,
    threadId: string,
  ): Promise<void> {
    await runEffectPromise(
      this.streamEffects.publishStreamCancelledEffect(context, threadId),
    );
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

    const seedTitle = this.buildSeedThreadTitle(request.content);

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

  private buildSeedThreadTitle(content: string): string {
    return content.substring(0, 100).trim();
  }

  private buildFallbackThreadTitle(prompt: string): string {
    const fillerPattern =
      /\b(can you|could you|help me|i need|i want|please|let's|lets|show me|tell me|give me|make me|create|generate|draft|write)\b/gi;
    const cleaned = prompt
      .replace(/[`"'“”‘’]/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(fillerPattern, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned
      .split(' ')
      .filter((word) => word.length > 1)
      .slice(0, 5);

    if (words.length === 0) {
      return this.buildSeedThreadTitle(prompt);
    }

    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private sanitizeGeneratedThreadTitle(title: string, prompt: string): string {
    const normalized = title
      .replace(/[`"'“”‘’]/g, ' ')
      .replace(/[^\w\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return this.buildFallbackThreadTitle(prompt);
    }

    const words = normalized.split(' ').filter(Boolean).slice(0, 5);
    if (words.length < 2) {
      return this.buildFallbackThreadTitle(prompt);
    }

    return words
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private extractThreadEnvelope(params: {
    assistantContent: string;
    prompt: string;
    seedTitle: string;
  }): { content: string; title: string | null } {
    if (!params.seedTitle.trim()) {
      return {
        content: params.assistantContent,
        title: null,
      };
    }

    const trimmed = params.assistantContent.trim();
    const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmed;
    let parsed: {
      content?: unknown;
      title?: unknown;
    } | null = null;

    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try {
        parsed = JSON.parse(candidate) as {
          content?: unknown;
          title?: unknown;
        };
      } catch {
        parsed = null;
      }
    }

    const content =
      typeof parsed?.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : params.assistantContent;
    const parsedTitle =
      typeof parsed?.title === 'string' ? parsed.title.trim() : '';

    return {
      content,
      title: parsedTitle
        ? this.sanitizeGeneratedThreadTitle(parsedTitle, params.prompt)
        : this.buildFallbackThreadTitle(params.prompt),
    };
  }

  private async maybeUpdateThreadTitle(params: {
    context: AgentChatContext;
    seedTitle: string;
    threadId: string;
    title: string | null;
  }): Promise<void> {
    const seedTitle = params.seedTitle.trim();
    const nextTitle = params.title?.trim() ?? '';

    if (!seedTitle || !nextTitle || nextTitle === seedTitle) {
      return;
    }

    const thread = (await this.agentThreadsService.findOne({
      _id: params.threadId,
      isDeleted: false,
      organization: params.context.organizationId,
      user: {
        in: [params.context.userId],
      },
    })) as { title?: string } | null;

    const currentTitle =
      typeof thread?.title === 'string' ? thread.title.trim() : '';
    if (currentTitle !== seedTitle) {
      return;
    }

    await this.agentThreadsService.updateThreadMetadata(
      params.threadId,
      params.context.organizationId,
      { title: nextTitle },
    );
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

  private buildToolDefinitions(
    allowedTools?: AgentToolName[],
  ): OpenRouterTool[] {
    const all = getToolDefinitions();
    const filtered = allowedTools
      ? all.filter((t) => allowedTools.includes(t.name as AgentToolName))
      : all;

    return filtered.map((tool) => ({
      function: {
        description: tool.description,
        name: tool.name,
        parameters: tool.parameters,
      },
      type: 'function' as const,
    }));
  }

  private mergeAllowedTools(
    preferred?: AgentToolName[],
    scoped?: AgentToolName[],
  ): AgentToolName[] | undefined {
    if (preferred && scoped) {
      return preferred.filter((tool) => scoped.includes(tool));
    }

    return scoped ?? preferred;
  }

  private getRequestScopedAllowedTools(
    requestContent: string,
  ): AgentToolName[] | undefined {
    if (!this.batchService.isBatchGenerationIntent(requestContent)) {
      return undefined;
    }

    return [
      AgentToolName.GENERATE_CONTENT_BATCH,
      AgentToolName.BATCH_APPROVE_REJECT,
      AgentToolName.GET_CURRENT_BRAND,
      AgentToolName.LIST_BRANDS,
      AgentToolName.LIST_REVIEW_QUEUE,
    ];
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

  private buildAgentChatCompletionParams(params: {
    messages: OpenRouterMessage[];
    model: string;
    prompt: string;
    seedTitle?: string;
    source?: AgentChatRequest['source'];
    tools: OpenRouterTool[];
  }): {
    max_tokens: number;
    messages: OpenRouterMessage[];
    model: string;
    plugins?: OpenRouterPlugin[];
    temperature: number;
    tool_choice: 'auto';
    tools: OpenRouterTool[];
  } {
    const routingPolicy = resolveAgentRoutingPolicy({
      model: params.model,
      prompt: params.prompt,
      source: params.source,
    });
    const plugins = resolveAgentRoutingPlugins(routingPolicy);
    const titleInstruction = params.seedTitle?.trim()
      ? [
          {
            content:
              'If you are ready to provide the final assistant reply for this new conversation and you are not making a tool call, respond with valid JSON only: {"title":"3 to 5 word title in title case","content":"full assistant reply"}. If you need to make a tool call, do that normally and ignore this formatting instruction until the final reply.',
            role: 'system' as const,
          },
        ]
      : [];

    return {
      max_tokens: 4096,
      messages: [...titleInstruction, ...params.messages],
      model: params.model,
      ...(plugins ? { plugins } : {}),
      temperature: 0.7,
      tool_choice: 'auto',
      tools: params.tools,
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

  private normalizeResponseModel(
    requestedModel: string,
    responseModel?: string,
  ): string {
    const trimmedRequestedModel = requestedModel.trim();
    const trimmedResponseModel = responseModel?.trim();

    if (!trimmedResponseModel) {
      return trimmedRequestedModel;
    }

    if (
      !trimmedResponseModel.includes('/') &&
      !trimmedRequestedModel.startsWith('openrouter/')
    ) {
      const provider = trimmedRequestedModel.split('/')[0];
      return `${provider}/${trimmedResponseModel}`;
    }

    return trimmedResponseModel;
  }

  private async recordAgentResponseModel(params: {
    actualModels?: string[];
    context: AgentChatContext;
    requestedModel: string;
    responseModel?: string;
    runId?: string;
    source?: AgentChatRequest['source'];
    threadId: string;
  }): Promise<string> {
    const actualModel = this.normalizeResponseModel(
      params.requestedModel,
      params.responseModel,
    );

    this.loggerService.log(`${this.constructorName} resolved agent response`, {
      actualModel,
      organizationId: params.context.organizationId,
      requestedModel: params.requestedModel,
      runId: params.runId,
      source: params.source ?? 'agent',
      threadId: params.threadId,
      userId: params.context.userId,
    });

    if (params.runId) {
      await this.agentRunsService.mergeMetadata(
        params.runId,
        params.context.organizationId,
        this.buildResolvedModelMetadata(params.requestedModel, [
          ...(params.actualModels ?? []),
          actualModel,
        ]),
      );
    }

    return actualModel;
  }
}
