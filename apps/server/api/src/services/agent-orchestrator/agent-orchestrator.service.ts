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
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { resolveEffectiveAgentExecutionConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import {
  AGENT_CREDIT_COSTS,
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
  type AgentArtifactCompletionMetadata,
  buildAgentArtifactCompletionMetadata,
  mergeAgentArtifactCompletionMetadata,
} from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
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
  AgentAutonomyMode,
  AgentExecutionTrigger,
  AgentMessageRole,
  AgentType,
  SubscriptionTier,
} from '@genfeedai/enums';
import {
  type AgentDashboardOperation,
  AgentToolName,
  type AgentUIBlock,
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
import { TIMEZONES } from '@helpers/formatting/timezone/timezone.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
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

const RESULT_SUMMARY_MAX_LENGTH = 500;

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

function summarizeToolResult(result: {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}): string {
  if (!result.success) {
    return result.error ?? 'Failed';
  }
  if (!result.data) {
    return 'OK';
  }
  const json = JSON.stringify(result.data);
  return json.length > RESULT_SUMMARY_MAX_LENGTH
    ? `${json.slice(0, RESULT_SUMMARY_MAX_LENGTH)}…`
    : json;
}

type RecurringTaskContentType = 'image' | 'video' | 'post' | 'newsletter';
type RecurringTaskInputField = 'prompt' | 'schedule' | 'variationBrief';
type ParsedRecurringSchedule = {
  schedule: string;
  timezone?: string;
};

interface RecurringTaskDraft extends Record<string, unknown> {
  contentType: RecurringTaskContentType;
  count: number;
  diversityMode?: 'low' | 'medium' | 'high';
  negativePrompt?: string;
  platform?: string;
  prompt?: string;
  schedule?: string;
  styleNotes?: string;
  workflowLabel?: string;
  timezone?: string;
}

interface RecurringTaskResumeCursor extends Record<string, unknown> {
  awaitingField?: RecurringTaskInputField;
  completedAt?: string;
  draft: RecurringTaskDraft;
  kind: 'recurring_workflow_setup';
  lastRequestId?: string;
  updatedAt: string;
}

interface BatchGenerationDraft {
  brandId?: string;
  count: number;
  dateRange: {
    end: string;
    start: string;
  };
  handle?: string;
  platforms: string[];
  topics?: string[];
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
    private readonly agentMemoriesService: AgentMemoriesService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly contextAssemblyService: AgentContextAssemblyService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly organizationsService: OrganizationsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly settingsService: SettingsService,
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly streamPublisher: AgentStreamPublisherService,
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

      const resolved = await this.resolveSystemPromptAndModel(request, context);
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

      const planModeResponse = await this.tryHandlePlanModeTurn({
        context,
        model,
        request,
        resolvedMemories,
        seedTitle,
        systemPromptOverride,
        threadId,
        turnCost,
      });

      if (planModeResponse) {
        return withAgentScopeResult(planModeResponse, scope);
      }

      const deterministicResponse = await this.tryHandleRecurringTaskDraftTurn({
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

    return await this.runInThreadLane(threadId, async () => {
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
            result = await this.executeApprovedPlanAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
            break;
          case 'revise_plan':
            result = await this.executeRevisedPlanAction({
              context,
              model,
              payload: request.payload,
              threadId,
            });
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
    let totalCreditsUsed = 0;
    const allArtifactMetadata: AgentArtifactCompletionMetadata[] = [];
    const allToolCalls: ToolCallSummary[] = [];
    const allUiActions: AgentUiAction[] = [];
    let highestRiskLevel: 'low' | 'medium' | 'high' = 'low';
    let reviewRequired = false;
    let latestUiBlocks: {
      operation: AgentDashboardOperation;
      blocks?: unknown[];
      blockIds?: string[];
    } | null = null;

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
        resolvedSystemPrompt = await this.injectCampaignContext(
          context.campaignId,
          context.organizationId,
          resolvedSystemPrompt,
        );
      }

      const { messages: recentMessages, compressedContext } =
        await this.resolveThreadMessages(threadId, context.organizationId);
      const history = this.buildMessageHistory(
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
            allToolCalls,
            allUiActions,
          );
          const content = normalizedContent.content;

          totalCreditsUsed += await settleAgentTurnCredits({
            creditsUtilsService: this.creditsUtilsService,
            model,
            organizationId: context.organizationId,
            toolCalls: allToolCalls,
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
            this.buildMemoryEntriesForResponse(resolvedMemories);
          const memoryInfluence =
            this.buildMemoryInfluenceMetadata(resolvedMemories);
          const reasoning = assistantMessage.reasoning_content ?? null;
          const enhancedUiActions =
            this.completionCardBuilder.buildAssistantUiActions({
              reviewRequired,
              toolCalls: allToolCalls,
              uiActions: allUiActions,
            });
          const artifactMetadata =
            mergeAgentArtifactCompletionMetadata(allArtifactMetadata);
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
            reviewRequired,
            riskLevel: highestRiskLevel,
            ...(enhancedUiActions.suggestedActions.length
              ? { suggestedActions: enhancedUiActions.suggestedActions }
              : {}),
            totalCreditsUsed,
            uiActions: enhancedUiActions.uiActions,
            ...(latestUiBlocks ? { uiBlocks: latestUiBlocks } : {}),
          };

          await this.persistRunArtifactMetadata(context, artifactMetadata);
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
            toolCalls: allToolCalls.map((tc) => ({
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
            creditsUsed: totalCreditsUsed,
            message: {
              content,
              metadata: assistantMetadata,
              role: 'assistant',
            },
            threadId,
            toolCalls: allToolCalls,
          };
        }

        messages.push({
          content: assistantMessage.content,
          role: 'assistant' as const,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const requestedToolName = toolCall.function.name as AgentToolName;
          let toolParams: Record<string, unknown> = {};
          const startTime = Date.now();

          try {
            toolParams = JSON.parse(toolCall.function.arguments);
          } catch {
            this.loggerService.warn(
              `Failed to parse tool arguments for ${requestedToolName}`,
              this.constructorName,
            );
          }

          let toolName = requestedToolName;

          if (!allowedToolNames.has(requestedToolName)) {
            const recoveredToolName = this.getGenerationPreparationRedirect(
              requestedToolName,
              allowedToolNames,
            );

            if (recoveredToolName) {
              toolName = recoveredToolName;
              toolParams = this.buildUnknownToolRecoveryParams(
                requestedToolName,
                toolParams,
              );

              this.loggerService.warn(
                `Recovered unknown tool ${requestedToolName} -> ${recoveredToolName}`,
                {
                  constructor: this.constructorName,
                  model,
                  organizationId: context.organizationId,
                  source: request.source ?? 'agent',
                  threadId,
                  toolName: requestedToolName,
                  userId: context.userId,
                },
              );
            } else {
              const unknownToolError = this.buildUnknownToolError(
                requestedToolName,
                allowedToolNames,
              );
              const durationMs = Date.now() - startTime;
              const summary: ToolCallSummary = {
                creditsUsed: 0,
                durationMs,
                error: unknownToolError,
                status: 'failed',
                toolName: requestedToolName,
              };

              this.loggerService.warn(unknownToolError, {
                allowedToolsCount: allowedToolNames.size,
                constructor: this.constructorName,
                model,
                organizationId: context.organizationId,
                source: request.source ?? 'agent',
                threadId,
                toolName: requestedToolName,
                userId: context.userId,
              });

              allToolCalls.push(summary);
              await this.threadEventRecorder.recordToolCompleted({
                context,
                durationMs,
                error: unknownToolError,
                runId: context.runId,
                status: 'failed',
                threadId,
                toolCallId: toolCall.id,
                toolName: requestedToolName,
              });

              messages.push({
                content: JSON.stringify({
                  availableTools: Array.from(allowedToolNames),
                  error: unknownToolError,
                  success: false,
                }),
                role: 'tool' as const,
                tool_call_id: toolCall.id,
              });
              continue;
            }
          }

          const preRemapToolName = toolName;
          const directGenerationOverride =
            this.getGenerationPreparationRedirect(toolName, allowedToolNames);
          if (directGenerationOverride) {
            const originalToolName = toolName;
            toolName = directGenerationOverride;
            toolParams = this.buildUnknownToolRecoveryParams(
              originalToolName,
              toolParams,
            );

            this.loggerService.log(
              `Remapped direct generation tool ${originalToolName} -> ${directGenerationOverride}`,
              {
                organizationId: context.organizationId,
                source: request.source ?? 'agent',
                threadId,
                userId: context.userId,
              },
            );
          }

          await this.threadEventRecorder.recordToolStarted({
            context,
            parameters: toolParams,
            runId: context.runId,
            threadId,
            toolCallId: toolCall.id,
            toolName,
          });

          const creditCost = AGENT_CREDIT_COSTS[toolName] ?? 0;
          // Gate affordability on the tool the model asked for: the
          // prepare_generation remap above would otherwise resolve a zero
          // cost and skip the check entirely (#482).
          const preflightCreditCost = Math.max(
            creditCost,
            AGENT_CREDIT_COSTS[preRemapToolName] ?? 0,
          );
          if (preflightCreditCost > 0) {
            const canAfford =
              await this.creditsUtilsService.checkOrganizationCreditsAvailable(
                context.organizationId,
                preflightCreditCost,
              );

            if (!canAfford) {
              const durationMs = Date.now() - startTime;
              const error = `Insufficient credits (need ${preflightCreditCost})`;
              const summary: ToolCallSummary = {
                creditsUsed: 0,
                durationMs,
                error,
                status: 'failed',
                toolName,
              };

              allToolCalls.push(summary);
              await this.threadEventRecorder.recordToolCompleted({
                context,
                durationMs,
                error,
                runId: context.runId,
                status: 'failed',
                threadId,
                toolCallId: toolCall.id,
                toolName,
              });

              messages.push({
                content: JSON.stringify({
                  error: `Insufficient credits. This tool requires ${preflightCreditCost} credits.`,
                  success: false,
                }),
                role: 'tool' as const,
                tool_call_id: toolCall.id,
              });
              continue;
            }
          }

          const result = await this.toolExecutorService.executeTool(
            toolName,
            toolParams,
            {
              attachmentUrls: request.attachments?.map((a) => a.url),
              authToken: context.authToken,
              autonomyMode: policy.autonomyMode,
              brandId: policy.brandId,
              creditGovernance: policy.creditGovernance,
              generationModelOverride: policy.generationModelOverride,
              generationPriority,
              organizationId: context.organizationId,
              platform: policy.platform,
              qualityTier: policy.qualityTier,
              reviewModelOverride: policy.reviewModelOverride,
              runId: context.runId,
              strategyId: context.strategyId,
              thinkingModel: policy.thinkingModelOverride ?? model,
              threadId,
              userId: context.userId,
              validatedScope: policy.scope,
            },
          );
          const durationMs = Date.now() - startTime;
          allArtifactMetadata.push(
            buildAgentArtifactCompletionMetadata(result.data, {
              brandId: context.scope?.brandId,
              organizationId: context.organizationId,
            }),
          );

          if (result.nextActions?.length) {
            allUiActions.push(...result.nextActions);
          }

          if (result.requiresConfirmation) {
            reviewRequired = true;
          }
          if (result.riskLevel === 'high') {
            highestRiskLevel = 'high';
          } else if (
            result.riskLevel === 'medium' &&
            highestRiskLevel === 'low'
          ) {
            highestRiskLevel = 'medium';
          }

          // Generation tools delegate billing to their endpoint (dynamic
          // amount); deducting the flat creditCost here would double-charge.
          const isOrchestratorBilled =
            result.success && creditCost > 0 && !result.isBillingDelegated;
          if (isOrchestratorBilled) {
            await this.creditsUtilsService.deductCreditsFromOrganization(
              context.organizationId,
              context.userId,
              creditCost,
              `Agent tool: ${toolName}`,
              ActivitySource.SCRIPT,
            );
            totalCreditsUsed += creditCost;
          }

          const summary: ToolCallSummary = {
            creditsUsed: isOrchestratorBilled ? creditCost : 0,
            durationMs,
            error: result.error,
            parameters: toolParams,
            resultSummary: summarizeToolResult(result),
            status: result.success ? 'completed' : 'failed',
            toolName,
          };
          allToolCalls.push(summary);

          if (
            toolName === AgentToolName.RENDER_DASHBOARD &&
            result.data?.uiBlocks
          ) {
            const normalizedBlocks = this.normalizeUiBlocks(
              result.data.uiBlocks as unknown[],
            );
            latestUiBlocks = {
              blockIds: result.data.blockIds as string[] | undefined,
              blocks: normalizedBlocks,
              operation: result.data.operation as AgentDashboardOperation,
            };
            await this.threadEventRecorder.recordUiBlocksUpdated({
              blockIds: result.data.blockIds as string[] | undefined,
              blocks: normalizedBlocks,
              context,
              operation: result.data.operation as AgentDashboardOperation,
              runId: context.runId,
              threadId,
            });
          }

          if (context.runId) {
            this.agentRunsService
              .recordToolCall(context.runId, context.organizationId, summary)
              .catch(() => undefined);
          }

          await this.threadEventRecorder.recordToolCompleted({
            context,
            durationMs,
            error: summary.error,
            runId: context.runId,
            status: summary.status,
            threadId,
            toolCallId: toolCall.id,
            toolName,
          });

          messages.push({
            content: JSON.stringify(result),
            role: 'tool' as const,
            tool_call_id: toolCall.id,
          });
        }
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

    const resolved = await this.resolveSystemPromptAndModel(request, context);
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

    const handledPlanMode = await this.tryHandlePlanModeTurnStream({
      context: streamContext,
      model,
      request,
      resolvedMemories,
      seedTitle,
      startedAt,
      systemPromptOverride,
      threadId,
      turnCost,
    });

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
      (await this.tryHandleBatchGenerationTurnStream({
        context: streamContext,
        model,
        policy,
        requestContent: request.content,
        seedTitle,
        startedAt,
        threadId,
      })) ||
      (await this.tryHandleRecurringTaskDraftTurnStream({
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

      let totalCreditsUsed = 0;
      const allArtifactMetadata: AgentArtifactCompletionMetadata[] = [];
      const allToolCalls: ToolCallSummary[] = [];
      const allUiActions: AgentUiAction[] = [];
      const memoryEntriesForResponse =
        this.buildMemoryEntriesForResponse(memoryEntries);
      const memoryInfluence = this.buildMemoryInfluenceMetadata(memoryEntries);
      let highestRiskLevel: 'low' | 'medium' | 'high' = 'low';
      let reviewRequired = false;
      let latestUiBlocks: {
        operation: AgentDashboardOperation;
        blocks?: unknown[];
        blockIds?: string[];
      } | null = null;

      // Build thread history from separate messages collection
      const {
        messages: recentMessages,
        compressedContext: streamCompressedCtx,
      } = await this.resolveThreadMessages(threadId, context.organizationId);
      const history = this.buildMessageHistory(
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
            allToolCalls,
            allUiActions,
          );
          const content = normalizedContent.content;

          totalCreditsUsed += await settleAgentTurnCredits({
            creditsUtilsService: this.creditsUtilsService,
            model,
            organizationId: context.organizationId,
            toolCalls: allToolCalls,
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
              reviewRequired,
              toolCalls: allToolCalls,
              uiActions: allUiActions,
            });
          const artifactMetadata =
            mergeAgentArtifactCompletionMetadata(allArtifactMetadata);

          // Save assistant message to DB
          await this.persistRunArtifactMetadata(context, artifactMetadata);
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
              reviewRequired,
              riskLevel: highestRiskLevel,
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
              totalCreditsUsed,
              uiActions: enhancedUiActions.uiActions,
            },
            organizationId: context.organizationId,
            role: AgentMessageRole.ASSISTANT,
            room: threadId,
            toolCalls: allToolCalls.map((tc) => ({
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
                reviewRequired,
                riskLevel: highestRiskLevel,
                ...(enhancedUiActions.suggestedActions.length
                  ? { suggestedActions: enhancedUiActions.suggestedActions }
                  : {}),
                totalCreditsUsed,
                uiActions: enhancedUiActions.uiActions,
                ...(latestUiBlocks ? { uiBlocks: latestUiBlocks } : {}),
              },
              content,
              context,
              creditsRemaining,
              creditsUsed: totalCreditsUsed,
              durationMs: runDurationMs,
              runStartedAt,
              threadId,
              toolCalls: allToolCalls,
            }),
          );

          return;
        }

        // Has tool calls — execute them
        messages.push({
          content: assistantMessage.content,
          role: 'assistant' as const,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          if (await this.isRunCancelled(context)) {
            await this.handleCancelledStream(context, threadId);
            return;
          }

          const requestedToolName = toolCall.function.name as AgentToolName;
          let toolParams: Record<string, unknown> = {};
          try {
            toolParams = JSON.parse(toolCall.function.arguments);
          } catch {
            /* ignore parse errors */
          }

          let toolName = requestedToolName;

          if (!allowedToolNames.has(requestedToolName)) {
            const recoveredToolName = this.getGenerationPreparationRedirect(
              requestedToolName,
              allowedToolNames,
            );

            if (recoveredToolName) {
              toolName = recoveredToolName;
              toolParams = this.buildUnknownToolRecoveryParams(
                requestedToolName,
                toolParams,
              );

              this.loggerService.warn(
                `Recovered unknown tool ${requestedToolName} -> ${recoveredToolName}`,
                {
                  constructor: this.constructorName,
                  model,
                  organizationId: context.organizationId,
                  source: source ?? 'agent',
                  threadId,
                  toolName: requestedToolName,
                  userId: context.userId,
                },
              );
            }
          }

          const preRemapToolName = toolName;
          const directGenerationOverride =
            this.getGenerationPreparationRedirect(toolName, allowedToolNames);
          if (directGenerationOverride) {
            const originalToolName = toolName;
            toolName = directGenerationOverride;
            toolParams = this.buildUnknownToolRecoveryParams(
              originalToolName,
              toolParams,
            );

            this.loggerService.log(
              `Remapped direct generation tool ${originalToolName} -> ${directGenerationOverride}`,
              {
                organizationId: context.organizationId,
                source: source ?? 'agent',
                threadId,
                userId: context.userId,
              },
            );
          }

          const creditCost = AGENT_CREDIT_COSTS[toolName] ?? 0;
          // Gate affordability on the tool the model asked for: the
          // prepare_generation remap above would otherwise resolve a zero
          // cost and skip the check entirely (#482).
          const preflightCreditCost = Math.max(
            creditCost,
            AGENT_CREDIT_COSTS[preRemapToolName] ?? 0,
          );
          const startTime = Date.now();

          await runEffectPromise(
            this.streamEffects.publishStreamingToolStartedEffect({
              context,
              parameters: toolParams,
              startedAt: new Date(startTime).toISOString(),
              threadId,
              toolCallId: toolCall.id,
              toolName,
            }),
          );

          if (!allowedToolNames.has(toolName)) {
            const unknownToolError = this.buildUnknownToolError(
              requestedToolName,
              allowedToolNames,
            );
            const durationMs = Date.now() - startTime;

            this.loggerService.warn(unknownToolError, {
              allowedToolsCount: allowedToolNames.size,
              constructor: this.constructorName,
              model,
              organizationId: context.organizationId,
              source: source ?? 'agent',
              threadId,
              toolName: requestedToolName,
              userId: context.userId,
            });

            const summary: ToolCallSummary = {
              creditsUsed: 0,
              durationMs,
              error: unknownToolError,
              status: 'failed',
              toolName: requestedToolName,
            };
            allToolCalls.push(summary);

            await runEffectPromise(
              this.streamEffects.publishStreamingToolCompletedEffect({
                context,
                debug: { error: summary.error, parameters: toolParams },
                detail: summary.error,
                durationMs: summary.durationMs,
                error: summary.error,
                label: requestedToolName,
                parameters: toolParams,
                resultSummary: summary.error,
                status: 'failed',
                threadId,
                toolCallId: toolCall.id,
                toolName: requestedToolName,
              }),
            );

            messages.push({
              content: JSON.stringify({
                availableTools: Array.from(allowedToolNames),
                error: unknownToolError,
                success: false,
              }),
              role: 'tool' as const,
              tool_call_id: toolCall.id,
            });
            continue;
          }

          // Check credits
          if (preflightCreditCost > 0) {
            const canAfford =
              await this.creditsUtilsService.checkOrganizationCreditsAvailable(
                context.organizationId,
                preflightCreditCost,
              );

            if (!canAfford) {
              const summary: ToolCallSummary = {
                creditsUsed: 0,
                durationMs: Date.now() - startTime,
                error: `Insufficient credits (need ${preflightCreditCost})`,
                status: 'failed',
                toolName,
              };
              allToolCalls.push(summary);

              await runEffectPromise(
                this.streamEffects.publishStreamingToolCompletedEffect({
                  context,
                  debug: { error: summary.error, parameters: toolParams },
                  detail: summary.error,
                  durationMs: summary.durationMs,
                  error: summary.error,
                  parameters: toolParams,
                  resultSummary: summary.error,
                  status: 'failed',
                  threadId,
                  toolCallId: toolCall.id,
                  toolName,
                }),
              );

              messages.push({
                content: JSON.stringify({
                  error: `Insufficient credits. This tool requires ${preflightCreditCost} credits.`,
                  success: false,
                }),
                role: 'tool' as const,
                tool_call_id: toolCall.id,
              });
              continue;
            }
          }

          // Execute tool
          const result = await this.toolExecutorService.executeTool(
            toolName,
            toolParams,
            {
              attachmentUrls: attachments?.map((a) => a.url),
              authToken: context.authToken,
              autonomyMode: resolvedPolicy.autonomyMode,
              brandId: resolvedPolicy.brandId,
              creditGovernance: resolvedPolicy.creditGovernance,
              generationModelOverride: resolvedPolicy.generationModelOverride,
              generationPriority,
              organizationId: context.organizationId,
              platform: resolvedPolicy.platform,
              qualityTier: resolvedPolicy.qualityTier,
              reviewModelOverride: resolvedPolicy.reviewModelOverride,
              runId: context.runId,
              strategyId: context.strategyId,
              thinkingModel: resolvedPolicy.thinkingModelOverride ?? undefined,
              threadId,
              userId: context.userId,
              validatedScope: resolvedPolicy.scope,
            },
          );

          if (await this.isRunCancelled(context)) {
            await this.handleCancelledStream(context, threadId);
            return;
          }

          const durationMs = Date.now() - startTime;
          allArtifactMetadata.push(
            buildAgentArtifactCompletionMetadata(result.data, {
              brandId: context.scope?.brandId,
              organizationId: context.organizationId,
            }),
          );

          if (result.nextActions?.length) {
            allUiActions.push(...result.nextActions);
          }

          if (result.requiresConfirmation) {
            reviewRequired = true;
          }
          if (result.riskLevel === 'high') {
            highestRiskLevel = 'high';
          } else if (
            result.riskLevel === 'medium' &&
            highestRiskLevel === 'low'
          ) {
            highestRiskLevel = 'medium';
          }

          // Generation tools delegate billing to their endpoint (dynamic
          // amount); deducting the flat creditCost here would double-charge.
          const isOrchestratorBilled =
            result.success && creditCost > 0 && !result.isBillingDelegated;
          if (isOrchestratorBilled) {
            await this.creditsUtilsService.deductCreditsFromOrganization(
              context.organizationId,
              context.userId,
              creditCost,
              `Agent tool: ${toolName}`,
              ActivitySource.SCRIPT,
            );
            totalCreditsUsed += creditCost;
          }

          const summary: ToolCallSummary = {
            creditsUsed: isOrchestratorBilled ? creditCost : 0,
            durationMs,
            error: result.error,
            parameters: toolParams,
            resultSummary: summarizeToolResult(result),
            status: result.success ? 'completed' : 'failed',
            toolName,
          };
          allToolCalls.push(summary);

          // Publish UI blocks from render_dashboard tool
          if (
            toolName === AgentToolName.RENDER_DASHBOARD &&
            result.data?.uiBlocks
          ) {
            const normalizedBlocks = this.normalizeUiBlocks(
              result.data.uiBlocks as unknown[],
            );
            latestUiBlocks = {
              blockIds: result.data.blockIds as string[] | undefined,
              blocks: normalizedBlocks,
              operation: result.data.operation as AgentDashboardOperation,
            };

            if (!result.data?.deferUiBlocksPublish) {
              await runEffectPromise(
                this.streamEffects.publishStreamUiBlocksEffect({
                  blockIds: result.data.blockIds as string[] | undefined,
                  blocks: normalizedBlocks as AgentUIBlocksEvent['blocks'],
                  context,
                  operation: result.data.operation as AgentDashboardOperation,
                  runId: context.runId,
                  threadId,
                }),
              );
            }
          }

          await runEffectPromise(
            this.streamEffects.publishStreamingToolCompletedEffect({
              context,
              creditsUsed: summary.creditsUsed,
              debug: summary.error
                ? {
                    error: summary.error,
                    parameters: toolParams,
                    result: result.data,
                  }
                : {
                    parameters: toolParams,
                    result: result.data,
                  },
              detail:
                summary.status === 'completed'
                  ? (summary.resultSummary ?? `${toolName} completed`)
                  : summary.error,
              durationMs,
              error: summary.error,
              parameters: toolParams,
              resultSummary: summary.resultSummary,
              status: summary.status,
              threadId,
              toolCallId: toolCall.id,
              toolName,
              uiActions: result.nextActions,
            }),
          );

          messages.push({
            content: JSON.stringify(result),
            role: 'tool' as const,
            tool_call_id: toolCall.id,
          });
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
    } as Record<string, unknown>);
    return {
      isCreated: true,
      seedTitle,
      threadId: String(thread.id),
    };
  }

  private async isPlanModeEnabledForThread(
    threadId: string,
    organizationId: string,
  ): Promise<boolean> {
    const thread = await this.agentThreadsService.findOne({
      _id: threadId,
      isDeleted: false,
      organization: organizationId,
    });

    return Boolean(
      (thread as { planModeEnabled?: boolean } | null)?.planModeEnabled,
    );
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

  async resumeRecurringTaskDraftFromInput(params: {
    answer: string;
    fieldId?: string;
    organizationId: string;
    runId?: string;
    scope: ValidatedAgentScope;
    threadId: string;
    userId: string;
  }): Promise<void> {
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(params.threadId, params.organizationId),
    );
    const resumeCursor = this.readRecurringTaskResumeCursor(
      binding?.resumeCursor as Record<string, unknown> | undefined,
    );

    if (!resumeCursor) {
      return;
    }

    const draft = { ...resumeCursor.draft };
    const fieldId = (params.fieldId ?? resumeCursor.awaitingField) as
      | RecurringTaskInputField
      | undefined;
    if (!fieldId) {
      return;
    }

    this.applyRecurringTaskAnswer(draft, fieldId, params.answer);

    const context: AgentChatContext = {
      organizationId: params.organizationId,
      runId: params.runId ?? binding?.runId,
      scope: params.scope,
      userId: params.userId,
    };
    await recordAgentRunScope(this.agentRunsService, context);

    const assistantResponse = await this.processRecurringTaskDraft({
      context,
      draft,
      model: binding?.model ?? DEFAULT_AGENT_CHAT_MODEL,
      threadId: params.threadId,
    });

    if (!assistantResponse) {
      return;
    }

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.organizationId,
      );

    await this.agentMessagesService.addMessage({
      brandId: context.scope?.brandId,
      content: assistantResponse.content,
      metadata: {
        ...buildAgentScopeMetadata(context),
        ...assistantResponse.metadata,
        creditsRemaining,
      },
      organizationId: params.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.userId,
    });

    if (this.streamPublisher) {
      await runEffectPromise(
        this.streamEffects.publishStreamDoneOnlyEffect({
          content: assistantResponse.content,
          context,
          creditsRemaining,
          creditsUsed: assistantResponse.creditsUsed,
          metadata: assistantResponse.metadata,
          startedAt: new Date().toISOString(),
          threadId: params.threadId,
          toolCalls: [],
        }),
      );
    }
  }

  private async tryHandleRecurringTaskDraftTurn(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    seedTitle: string;
    threadId: string;
  }): Promise<AgentChatResult | null> {
    const assistantResponse =
      await this.prepareRecurringTaskDraftResponse(params);

    if (!assistantResponse) {
      return null;
    }

    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: this.buildFallbackThreadTitle(params.requestContent),
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...assistantResponse.metadata,
      creditsRemaining,
      totalCreditsUsed: assistantResponse.creditsUsed,
    };

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: assistantResponse.content,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content: assistantResponse.content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Recurring automation setup completed',
      runId: params.context.runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: assistantResponse.creditsUsed,
      message: {
        content: assistantResponse.content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  private async tryHandlePlanModeTurn(params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }): Promise<AgentChatResult | null> {
    const isEnabled = await this.isPlanModeEnabledForThread(
      params.threadId,
      params.context.organizationId,
    );

    if (!isEnabled) {
      return null;
    }

    return await this.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request: params.request,
      resolvedMemories: params.resolvedMemories,
      seedTitle: params.seedTitle,
      systemPromptOverride: params.systemPromptOverride,
      threadId: params.threadId,
      turnCost: params.turnCost,
    });
  }

  private async tryHandlePlanModeTurnStream(params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    startedAt: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }): Promise<boolean> {
    const isEnabled = await this.isPlanModeEnabledForThread(
      params.threadId,
      params.context.organizationId,
    );

    if (!isEnabled) {
      return false;
    }

    const response = await this.generatePlanModeResponse({
      context: params.context,
      model: params.model,
      request: params.request,
      resolvedMemories: params.resolvedMemories,
      seedTitle: params.seedTitle,
      systemPromptOverride: params.systemPromptOverride,
      threadId: params.threadId,
      turnCost: params.turnCost,
    });

    await runEffectPromise(
      this.streamEffects.publishStreamDoneOnlyEffect({
        content: response.message.content,
        context: params.context,
        creditsRemaining: response.creditsRemaining,
        creditsUsed: response.creditsUsed,
        metadata: response.message.metadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [],
      }),
    );

    return true;
  }

  private async generatePlanModeResponse(params: {
    context: AgentChatContext;
    model: string;
    reviewMetadata?: {
      lastReviewAction?: 'approve' | 'request_changes';
      revisionNote?: string;
    };
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }): Promise<AgentChatResult> {
    const { messages: recentMessages, compressedContext: planCompressedCtx } =
      await this.resolveThreadMessages(
        params.threadId,
        params.context.organizationId,
      );
    const history = this.buildMessageHistory(
      recentMessages,
      params.systemPromptOverride,
      params.resolvedMemories,
      params.request.attachments,
      planCompressedCtx,
    );

    const response = await this.llmDispatcher.chatCompletion(
      this.buildPlanningChatCompletionParams({
        messages: history,
        model: params.model,
        prompt: params.request.content,
        seedTitle: params.seedTitle,
        source: params.request.source,
      }),
      params.context.organizationId,
    );

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No planning response from LLM');
    }

    const envelope = this.extractPlanEnvelope({
      assistantContent: sanitizeAgentOutputText(choice.message.content || ''),
      prompt: params.request.content,
      seedTitle: params.seedTitle,
    });
    const plan = {
      ...envelope.plan,
      ...(params.reviewMetadata?.lastReviewAction
        ? { lastReviewAction: params.reviewMetadata.lastReviewAction }
        : {}),
      ...(params.reviewMetadata?.revisionNote
        ? { revisionNote: params.reviewMetadata.revisionNote }
        : {}),
    };

    await this.creditsUtilsService.deductCreditsFromOrganization(
      params.context.organizationId,
      params.context.userId,
      params.turnCost,
      `Agent planning turn (${params.model})`,
      ActivitySource.SCRIPT,
    );

    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: envelope.title,
    });

    await this.threadEventRecorder.recordPlanUpserted({
      context: params.context,
      plan,
      runId: params.context.runId,
      threadId: params.threadId,
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...buildAgentRoutingMetadata({
        model: params.model,
        prompt: params.request.content,
        source: params.request.source,
      }),
      ...this.buildResolvedModelMetadata(params.model),
      proposedPlan: plan,
      reviewRequired: true,
      riskLevel: 'low' as const,
      totalCreditsUsed: params.turnCost,
    };
    const content =
      envelope.summary ||
      'I drafted a plan and paused here for your approval. Review it, then approve or request changes.';

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content,
      metadata: {
        creditsRemaining,
        ...assistantMetadata,
      },
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content,
      context: params.context,
      metadata: assistantMetadata,
      runId: params.context.runId,
      threadId: params.threadId,
    });
    await this.threadEventRecorder.recordRunCompleted({
      context: params.context,
      detail: 'Plan proposed and awaiting approval',
      runId: params.context.runId,
      threadId: params.threadId,
    });

    return {
      creditsRemaining,
      creditsUsed: params.turnCost,
      message: {
        content,
        metadata: assistantMetadata,
        role: 'assistant',
      },
      threadId: params.threadId,
      toolCalls: [],
    };
  }

  private async tryHandleBatchGenerationTurnStream(params: {
    context: AgentChatContext;
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    requestContent: string;
    seedTitle: string;
    startedAt: string;
    threadId: string;
  }): Promise<boolean> {
    const draft = this.extractBatchGenerationDraftFromMessage(
      params.requestContent,
      params.policy.brandId,
    );

    if (!draft) {
      return false;
    }

    const toolName = AgentToolName.GENERATE_CONTENT_BATCH;
    const toolCallId = `${params.context.runId ?? params.threadId}:batch`;
    const toolParams: Record<string, unknown> = {
      count: draft.count,
      dateRange: draft.dateRange,
      platforms: draft.platforms,
      ...(draft.brandId ? { brandId: draft.brandId } : {}),
      ...(draft.handle ? { handle: draft.handle } : {}),
      ...(draft.topics?.length ? { topics: draft.topics } : {}),
    };
    const startedAtIso = new Date().toISOString();
    const startTime = Date.now();

    await this.threadEventRecorder.recordToolStarted({
      context: params.context,
      parameters: toolParams,
      runId: params.context.runId,
      threadId: params.threadId,
      toolName,
    });
    await runEffectPromise(
      this.streamEffects.publishStreamingToolStartedEffect({
        context: params.context,
        detail: `Starting ${toolName}`,
        label: toolName,
        parameters: toolParams,
        progress: 10,
        startedAt: startedAtIso,
        threadId: params.threadId,
        toolCallId,
        toolName,
        workEventDetail: `Creating ${draft.count} post${draft.count === 1 ? '' : 's'} and streaming drafts as they finish.`,
        workEventLabel: 'Batch generation',
      }),
    );

    const result = await this.toolExecutorService.executeTool(
      toolName,
      toolParams,
      {
        authToken: params.context.authToken,
        autonomyMode: params.policy.autonomyMode,
        brandId: params.policy.brandId,
        creditGovernance: params.policy.creditGovernance,
        generationModelOverride: params.policy.generationModelOverride,
        generationPriority: params.context.generationPriority,
        organizationId: params.context.organizationId,
        platform: params.policy.platform,
        qualityTier: params.policy.qualityTier,
        reviewModelOverride: params.policy.reviewModelOverride,
        runId: params.context.runId,
        strategyId: params.context.strategyId,
        streamBatchToUser: true,
        thinkingModel: params.policy.thinkingModelOverride ?? undefined,
        threadId: params.threadId,
        userId: params.context.userId,
        validatedScope: params.policy.scope,
      },
    );

    const durationMs = Date.now() - startTime;
    const summary: ToolCallSummary = {
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      durationMs,
      error: result.error,
      parameters: toolParams,
      resultSummary:
        typeof result.data?.message === 'string'
          ? result.data.message
          : undefined,
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
    await runEffectPromise(
      this.streamEffects.publishStreamingToolCompletedEffect({
        context: params.context,
        creditsUsed: summary.creditsUsed,
        detail: summary.error ?? summary.resultSummary,
        durationMs,
        error: summary.error,
        label: toolName,
        parameters: toolParams,
        resultSummary: summary.resultSummary,
        status: summary.status,
        threadId: params.threadId,
        toolCallId,
        toolName,
      }),
    );

    if (!result.success) {
      await runEffectPromise(
        this.streamEffects.publishStreamErrorOnlyEffect(
          params.context,
          params.threadId,
          result.error ?? 'Batch generation failed',
        ),
      );
      return true;
    }

    const fullContent =
      typeof result.data?.streamedTranscript === 'string'
        ? result.data.streamedTranscript
        : typeof result.data?.message === 'string'
          ? result.data.message
          : 'Batch generation completed.';
    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: this.buildFallbackThreadTitle(params.requestContent),
    });
    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const enhancedUiActions =
      this.completionCardBuilder.buildAssistantUiActions({
        reviewRequired: result.requiresConfirmation ?? false,
        toolCalls: [{ status: summary.status, toolName }],
        uiActions: result.nextActions ?? [],
      });
    const artifactMetadata = buildAgentArtifactCompletionMetadata(result.data, {
      brandId: params.context.scope?.brandId,
      organizationId: params.context.organizationId,
    });
    const assistantMetadata = {
      ...artifactMetadata,
      ...buildAgentScopeMetadata(params.context),
      creditsRemaining,
      ...this.buildResolvedModelMetadata(params.model),
      reviewRequired: result.requiresConfirmation ?? false,
      riskLevel: result.riskLevel ?? 'low',
      ...(enhancedUiActions.suggestedActions.length
        ? { suggestedActions: enhancedUiActions.suggestedActions }
        : {}),
      totalCreditsUsed: result.creditsUsed ?? 0,
      uiActions: enhancedUiActions.uiActions,
    };

    await this.persistRunArtifactMetadata(params.context, artifactMetadata);
    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: fullContent,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      toolCalls: [
        {
          creditsUsed: summary.creditsUsed,
          durationMs: summary.durationMs,
          error: summary.error,
          parameters: summary.parameters ?? {},
          result: summary.resultSummary
            ? { summary: summary.resultSummary }
            : {},
          status: summary.status,
          toolName,
        },
      ],
      userId: params.context.userId,
    });
    await this.threadEventRecorder.recordAssistantFinalized({
      content: fullContent,
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
    await runEffectPromise(
      this.streamEffects.publishStreamDoneOnlyEffect({
        content: fullContent,
        context: params.context,
        creditsRemaining,
        creditsUsed: result.creditsUsed ?? 0,
        metadata: assistantMetadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [summary],
      }),
    );

    return true;
  }

  private async tryHandleRecurringTaskDraftTurnStream(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    seedTitle: string;
    startedAt: string;
    threadId: string;
  }): Promise<boolean> {
    const assistantResponse =
      await this.prepareRecurringTaskDraftResponse(params);

    if (!assistantResponse) {
      return false;
    }

    await this.maybeUpdateThreadTitle({
      context: params.context,
      seedTitle: params.seedTitle,
      threadId: params.threadId,
      title: this.buildFallbackThreadTitle(params.requestContent),
    });

    const creditsRemaining =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        params.context.organizationId,
      );
    const assistantMetadata = {
      ...buildAgentScopeMetadata(params.context),
      ...assistantResponse.metadata,
      creditsRemaining,
      totalCreditsUsed: assistantResponse.creditsUsed,
    };

    await this.agentMessagesService.addMessage({
      brandId: params.context.scope?.brandId,
      content: assistantResponse.content,
      metadata: assistantMetadata,
      organizationId: params.context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: params.threadId,
      userId: params.context.userId,
    });

    await runEffectPromise(
      this.streamEffects.publishStreamDoneOnlyEffect({
        content: assistantResponse.content,
        context: params.context,
        creditsRemaining,
        creditsUsed: assistantResponse.creditsUsed,
        metadata: assistantMetadata,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: [],
      }),
    );

    return true;
  }

  private async prepareRecurringTaskDraftResponse(params: {
    context: AgentChatContext;
    model: string;
    requestContent: string;
    threadId: string;
  }): Promise<{
    content: string;
    creditsUsed: number;
    metadata: Record<string, unknown>;
  } | null> {
    const binding = await runEffectPromise(
      this.getRuntimeBindingEffect(
        params.threadId,
        params.context.organizationId,
      ),
    );
    const activeDraft = this.readRecurringTaskResumeCursor(
      binding?.resumeCursor as Record<string, unknown> | undefined,
    );
    const isRecurringIntent = this.isRecurringTaskIntent(params.requestContent);

    if (!activeDraft && !isRecurringIntent) {
      return null;
    }

    const defaultTimezone = await this.resolveOrganizationTimezone(
      params.context.organizationId,
    );
    const draft = activeDraft
      ? { ...activeDraft.draft }
      : this.extractRecurringTaskDraftFromMessage(
          params.requestContent,
          defaultTimezone,
        );

    return await this.processRecurringTaskDraft({
      context: params.context,
      draft,
      model: params.model,
      threadId: params.threadId,
    });
  }

  private async processRecurringTaskDraft(params: {
    context: AgentChatContext;
    draft: RecurringTaskDraft;
    model: string;
    threadId: string;
  }): Promise<{
    content: string;
    creditsUsed: number;
    metadata: Record<string, unknown>;
  } | null> {
    const missingField = this.getNextRecurringTaskField(params.draft);

    if (missingField) {
      await this.persistRecurringTaskDraft(
        params.threadId,
        params.context,
        params.draft,
        missingField,
      );
      await this.publishRecurringTaskInputRequest(
        params.threadId,
        params.context,
        params.draft,
        missingField,
      );

      return {
        content:
          missingField === 'prompt'
            ? 'I need the core generation brief before I create this recurring automation.'
            : missingField === 'schedule'
              ? 'I need the cadence for this recurring automation before I create it.'
              : 'I need one more creative constraint so each run stays useful instead of producing near-duplicates.',
        creditsUsed: 0,
        metadata: this.buildResolvedModelMetadata(params.model),
      };
    }

    const result = await this.toolExecutorService.executeTool(
      AgentToolName.CREATE_WORKFLOW,
      {
        contentType: params.draft.contentType,
        count: params.draft.count,
        diversityMode: params.draft.diversityMode ?? 'medium',
        label: params.draft.workflowLabel,
        negativePrompt: params.draft.negativePrompt,
        prompt: params.draft.prompt,
        schedule: params.draft.schedule,
        styleNotes: params.draft.styleNotes,
        timezone: params.draft.timezone,
      },
      {
        brandId: params.context.scope?.brandId,
        organizationId: params.context.organizationId,
        runId: params.context.runId,
        validatedScope: params.context.scope,
        threadId: params.threadId,
        userId: params.context.userId,
      },
    );

    await this.persistRecurringTaskDraft(
      params.threadId,
      params.context,
      params.draft,
      undefined,
      new Date().toISOString(),
    );

    return {
      content: result.success
        ? 'Recurring automation created.'
        : (result.error ?? 'Failed to create the recurring automation.'),
      creditsUsed: result.success ? (result.creditsUsed ?? 0) : 0,
      metadata: result.success
        ? (() => {
            const enhancedUiActions =
              this.completionCardBuilder.buildAssistantUiActions({
                reviewRequired: result.requiresConfirmation ?? false,
                toolCalls: [
                  {
                    status: 'completed',
                    toolName: AgentToolName.CREATE_WORKFLOW,
                  },
                ],
                uiActions: result.nextActions ?? [],
              });

            return {
              ...this.buildResolvedModelMetadata(params.model),
              reviewRequired: result.requiresConfirmation ?? false,
              riskLevel: result.riskLevel ?? 'low',
              ...(enhancedUiActions.suggestedActions.length
                ? { suggestedActions: enhancedUiActions.suggestedActions }
                : {}),
              uiActions: enhancedUiActions.uiActions,
            };
          })()
        : this.buildResolvedModelMetadata(params.model),
    };
  }

  private async publishRecurringTaskInputRequest(
    threadId: string,
    context: AgentChatContext,
    draft: RecurringTaskDraft,
    fieldId: RecurringTaskInputField,
  ): Promise<void> {
    if (!this.streamPublisher) {
      return;
    }

    const inputRequestId = `recurring-workflow:${threadId}:${fieldId}:${Date.now()}`;
    const config =
      fieldId === 'prompt'
        ? {
            allowFreeText: true,
            prompt:
              'What should these assets actually communicate or promote? Be specific about the product, campaign, or offer.',
            title: 'Define the recurring brief',
          }
        : fieldId === 'schedule'
          ? {
              allowFreeText: true,
              prompt:
                'What cadence should this run on? Example: every day at 5pm or every weekday at 9am.',
              title: 'Confirm the schedule',
            }
          : {
              allowFreeText: true,
              options: [
                {
                  description:
                    'Best default for recurring social batches with one campaign direction.',
                  id: 'same-campaign-varied-concepts',
                  label:
                    'Keep the campaign consistent, vary concept and composition',
                },
                {
                  description:
                    'Use this when you want stronger novelty between each asset in a run.',
                  id: 'distinct-directions',
                  label: 'Push each asset into a more distinct direction',
                },
              ],
              prompt:
                'What should stay consistent across the batch, and what should vary between each asset?',
              recommendedOptionId: 'same-campaign-varied-concepts',
              title: 'Set the variation strategy',
            };

    await this.persistRecurringTaskDraft(
      threadId,
      context,
      draft,
      fieldId,
      undefined,
      inputRequestId,
    );

    await runEffectPromise(
      this.streamEffects.publishStreamInputRequestEffect({
        ...config,
        context,
        fieldId,
        inputRequestId,
        metadata: {
          flow: 'recurring_workflow_setup',
        },
        runId: context.runId,
        threadId,
      }),
    );
  }

  private async persistRecurringTaskDraft(
    threadId: string,
    context: AgentChatContext,
    draft: RecurringTaskDraft,
    awaitingField?: RecurringTaskInputField,
    completedAt?: string,
    lastRequestId?: string,
  ): Promise<void> {
    const resumeCursor: RecurringTaskResumeCursor = {
      ...(awaitingField ? { awaitingField } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(lastRequestId ? { lastRequestId } : {}),
      draft,
      kind: 'recurring_workflow_setup',
      updatedAt: new Date().toISOString(),
    };

    await runEffectPromise(
      this.upsertRuntimeBindingEffect({
        organizationId: context.organizationId,
        resumeCursor,
        runId: context.runId,
        status: completedAt
          ? 'completed'
          : awaitingField
            ? 'waiting_input'
            : 'running',
        threadId,
      }),
    );
  }

  private readRecurringTaskResumeCursor(
    resumeCursor: Record<string, unknown> | undefined,
  ): RecurringTaskResumeCursor | null {
    if (!resumeCursor || resumeCursor.kind !== 'recurring_workflow_setup') {
      return null;
    }

    const draft = resumeCursor.draft;
    if (!draft || typeof draft !== 'object') {
      return null;
    }

    return resumeCursor as RecurringTaskResumeCursor;
  }

  private isRecurringTaskIntent(content: string): boolean {
    const normalized = content.toLowerCase();
    const hasRecurringSignal =
      normalized.includes('every day') ||
      normalized.includes('daily') ||
      normalized.includes('every week') ||
      normalized.includes('weekly') ||
      normalized.includes('recurring');
    const hasAssetSignal = /(image|video|post|newsletter)/.test(normalized);

    return hasRecurringSignal && hasAssetSignal;
  }

  private extractRecurringTaskDraftFromMessage(
    content: string,
    defaultTimezone: string,
  ): RecurringTaskDraft {
    const normalized = content.toLowerCase();
    const countMatch = normalized.match(
      /\b(\d{1,2})\s+(?:instagram|tiktok|linkedin|x|twitter|facebook)?\s*(images?|videos?|posts?|newsletters?)\b/,
    );
    const contentType = normalized.includes('video')
      ? 'video'
      : normalized.includes('newsletter')
        ? 'newsletter'
        : normalized.includes('post')
          ? 'post'
          : 'image';
    const platformMatch = normalized.match(
      /\b(instagram|tiktok|linkedin|x|twitter|facebook)\b/,
    );
    const parsedSchedule = this.extractCronScheduleFromMessage(normalized);

    return {
      contentType,
      count: countMatch ? Number.parseInt(countMatch[1], 10) : 1,
      diversityMode: normalized.includes('distinct')
        ? 'high'
        : normalized.includes('consistent')
          ? 'low'
          : 'medium',
      platform: platformMatch?.[1],
      prompt: this.extractRecurringPromptFromMessage(content),
      schedule: parsedSchedule?.schedule,
      styleNotes: this.extractStyleNotesFromMessage(content),
      timezone: parsedSchedule?.timezone ?? defaultTimezone,
    };
  }

  private extractRecurringPromptFromMessage(
    content: string,
  ): string | undefined {
    const cleaned = content
      .replace(/\bcreate\b/gi, '')
      .replace(/\bmake\b/gi, '')
      .replace(/\bgenerate\b/gi, '')
      .replace(/\bset up\b/gi, '')
      .replace(/\brecurring\b/gi, '')
      .replace(/\bfor instagram\b/gi, '')
      .replace(/\bon instagram\b/gi, '')
      .replace(/\binstagram\b/gi, '')
      .replace(/\bfor tiktok\b/gi, '')
      .replace(/\bon tiktok\b/gi, '')
      .replace(/\btiktok\b/gi, '')
      .replace(/\bfor linkedin\b/gi, '')
      .replace(/\bon linkedin\b/gi, '')
      .replace(/\blinkedin\b/gi, '')
      .replace(/\bfor facebook\b/gi, '')
      .replace(/\bon facebook\b/gi, '')
      .replace(/\bfacebook\b/gi, '')
      .replace(/\bfor twitter\b/gi, '')
      .replace(/\bon twitter\b/gi, '')
      .replace(/\btwitter\b/gi, '')
      .replace(/\bfor x\b/gi, '')
      .replace(/\bon x\b/gi, '')
      .replace(/\bx\b/gi, '')
      .replace(/\b\d{1,2}\s+(images?|videos?|posts?|newsletters?)\b/gi, '')
      .replace(/\bimages?\b/gi, '')
      .replace(/\bvideos?\b/gi, '')
      .replace(/\bposts?\b/gi, '')
      .replace(/\bnewsletters?\b/gi, '')
      .replace(
        /\b(?:every day|daily|every weekday|weekdays|each month|every month|every week|weekly)(?:.*)$/i,
        '',
      )
      .replace(/\bin\s+an?\s+.+?\s+style\b/gi, '')
      .replace(/\bwith\s+an?\s+.+?\s+style\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(for|about|around)\s+/i, '');

    return cleaned.length >= 8 ? cleaned : undefined;
  }

  private extractStyleNotesFromMessage(content: string): string | undefined {
    const styleMatch = content.match(/\b(?:in|with)\s+an?\s+(.+?)\s+style\b/i);
    return styleMatch?.[1]?.trim();
  }

  private extractCronScheduleFromMessage(
    content: string,
  ): ParsedRecurringSchedule | null {
    const timezone = this.extractTimezoneFromMessage(content);
    const extractTime = (
      match: RegExpMatchArray,
    ): { hour: number; minute: number } => {
      const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
      let hour = Number.parseInt(match[1], 10);
      const meridiem = match[3];

      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return { hour, minute };
    };

    const dailyMatch = content.match(
      /\b(?:every day|daily)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );

    if (dailyMatch) {
      const { hour, minute } = extractTime(dailyMatch);
      return { schedule: `${minute} ${hour} * * *`, timezone };
    }

    const weekdayMatch = content.match(
      /\b(?:every weekday|weekdays)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (weekdayMatch) {
      const { hour, minute } = extractTime(weekdayMatch);
      return { schedule: `${minute} ${hour} * * 1-5`, timezone };
    }

    const weeklyMatch = content.match(
      /\b(?:every|each)(?:\s+week)?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (weeklyMatch) {
      const weekdayMap: Record<string, number> = {
        friday: 5,
        monday: 1,
        saturday: 6,
        sunday: 0,
        thursday: 4,
        tuesday: 2,
        wednesday: 3,
      };
      const minute = weeklyMatch[3] ? Number.parseInt(weeklyMatch[3], 10) : 0;
      let hour = Number.parseInt(weeklyMatch[2], 10);
      const meridiem = weeklyMatch[4];
      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return {
        schedule: `${minute} ${hour} * * ${weekdayMap[weeklyMatch[1]]}`,
        timezone,
      };
    }

    const monthlyMatch = content.match(
      /\b(?:every|each)\s+month(?:\s+on)?\s+(?:day\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    );
    if (monthlyMatch) {
      const minute = monthlyMatch[3] ? Number.parseInt(monthlyMatch[3], 10) : 0;
      let hour = Number.parseInt(monthlyMatch[2], 10);
      const meridiem = monthlyMatch[4];
      if (meridiem === 'pm' && hour < 12) {
        hour += 12;
      }
      if (meridiem === 'am' && hour === 12) {
        hour = 0;
      }

      return {
        schedule: `${minute} ${hour} ${monthlyMatch[1]} * *`,
        timezone,
      };
    }

    return null;
  }

  private extractTimezoneFromMessage(content: string): string | undefined {
    const ianaMatch = content.match(/\b([a-z]+\/[a-z_]+(?:\/[a-z_]+)?)\b/i);
    if (ianaMatch?.[1]) {
      return ianaMatch[1];
    }

    const timezoneAliases: Record<string, string> = {
      cet: 'Europe/Paris',
      cst: 'America/Chicago',
      est: 'America/New_York',
      london: 'Europe/London',
      malta: 'Europe/Malta',
      paris: 'Europe/Paris',
      pst: 'America/Los_Angeles',
      utc: 'UTC',
    };

    for (const timezone of TIMEZONES) {
      const normalizedLabel = timezone.label.toLowerCase();
      if (
        content.includes(timezone.value.toLowerCase()) ||
        content.includes(normalizedLabel.split(' ')[0])
      ) {
        return timezone.value;
      }
    }

    for (const [alias, resolvedTimezone] of Object.entries(timezoneAliases)) {
      if (new RegExp(`\\b${alias}\\b`, 'i').test(content)) {
        return resolvedTimezone;
      }
    }

    return undefined;
  }

  private getNextRecurringTaskField(
    draft: RecurringTaskDraft,
  ): RecurringTaskInputField | null {
    if (!draft.prompt?.trim()) {
      return 'prompt';
    }
    if (!draft.schedule?.trim()) {
      return 'schedule';
    }
    if (!draft.styleNotes?.trim()) {
      return 'variationBrief';
    }
    return null;
  }

  private applyRecurringTaskAnswer(
    draft: RecurringTaskDraft,
    fieldId: RecurringTaskInputField,
    answer: string,
  ): void {
    const normalized = answer.trim();

    if (!normalized) {
      return;
    }

    if (fieldId === 'prompt') {
      draft.prompt = normalized;
      return;
    }

    if (fieldId === 'schedule') {
      const parsedSchedule = this.extractCronScheduleFromMessage(
        normalized.toLowerCase(),
      );
      draft.schedule = parsedSchedule?.schedule ?? normalized;
      draft.timezone = parsedSchedule?.timezone ?? draft.timezone;
      return;
    }

    draft.styleNotes = normalized;
    if (/distinct|different|varied|variety|novel|vary/i.test(normalized)) {
      draft.diversityMode = 'high';
    } else if (/consistent|same campaign|tight/i.test(normalized)) {
      draft.diversityMode = 'low';
    } else {
      draft.diversityMode = draft.diversityMode ?? 'medium';
    }
  }

  private async resolveOrganizationTimezone(
    organizationId: string,
  ): Promise<string> {
    const organization = await this.organizationsService.findOne({
      _id: organizationId,
      isDeleted: false,
    });
    const settings = organization?.settings as
      | { timezone?: string }
      | undefined;

    return settings?.timezone?.trim() || 'UTC';
  }

  private async resolveSystemPromptAndModel(
    request: AgentChatRequest,
    context: AgentChatContext,
  ): Promise<{
    model: string | undefined;
    policy: ResolvedAgentExecutionPolicy;
    preparedScope: PreparedAgentScope;
    resolvedSkills: ResolvedRuntimeSkill[];
    systemPrompt: string | undefined;
    memories: AgentMemoryDocument[];
  }> {
    const shouldUseOnboardingPrompt = request.source === 'onboarding';
    const strategy = context.strategyId
      ? await this.agentStrategiesService.findOneById(
          context.strategyId,
          context.organizationId,
        )
      : null;
    const agentTypeConfig = request.agentType
      ? getAgentTypeConfig(request.agentType)
      : null;
    const orgSettings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organization: context.organizationId,
    });
    const { policy: basePolicy, strategyModel } =
      resolveEffectiveAgentExecutionConfig({
        organizationSettings: orgSettings,
        strategy,
      });
    const preparedScope = await this.agentScopeContextService.prepareForTurn({
      expectedContextVersion: request.expectedContextVersion,
      organizationId: context.organizationId,
      policyBrandId: basePolicy.brandId,
      requestedBrandId: request.brandId,
      threadId: request.threadId,
      userId: context.userId,
    });
    const policy: ResolvedAgentExecutionPolicy = {
      ...basePolicy,
      brandId:
        preparedScope.existingScope?.brandId ?? preparedScope.initialBrandId,
    };

    let thread: {
      systemPrompt?: string;
      memoryEntryIds?: string[];
    } | null = null;

    if (isEntityId(request.threadId)) {
      thread = (await this.agentThreadsService.findOne({
        _id: request.threadId,
        isDeleted: false,
        organization: context.organizationId,
      })) as { systemPrompt?: string; memoryEntryIds?: string[] } | null;
    }

    const memories =
      await this.agentMemoriesService.getFeedbackMemoriesForGeneration(
        context.userId,
        context.organizationId,
        {
          brandId: policy.brandId,
          campaignId: context.campaignId,
          contentType: this.inferMemoryContentType(request.content),
          limit: 8,
          pinnedMemoryIds: thread?.memoryEntryIds,
          platform: policy.platform,
          query: request.content,
        },
      );

    const replyStyle = orgSettings?.agentReplyStyle;
    const subscriptionDefaultModel =
      !request.model &&
      !strategyModel &&
      !policy.thinkingModelOverride &&
      PAID_SUBSCRIPTION_TIERS.has(orgSettings?.subscriptionTier ?? '')
        ? LOCAL_DEFAULT_AGENT_CHAT_MODEL
        : undefined;
    const shouldLoadBrandContext =
      Boolean(policy.brandId) ||
      (!thread?.systemPrompt && !request.systemPromptOverride);
    const brandContext = shouldLoadBrandContext
      ? await this.contextAssemblyService.assembleContext({
          brandId: policy.brandId,
          layers: {
            brandGuidance: true,
            brandIdentity: true,
            brandMemory: true,
          },
          organizationId: context.organizationId,
          platform: policy.platform,
        })
      : null;
    const resolveModel = (brandDefaultModel?: string): string | undefined =>
      request.model ||
      strategyModel ||
      policy.thinkingModelOverride ||
      subscriptionDefaultModel ||
      brandDefaultModel ||
      agentTypeConfig?.defaultModel ||
      DEFAULT_AGENT_CHAT_MODEL;

    const resolvedSkills =
      this.skillRuntimeService && policy.brandId
        ? await this.skillRuntimeService.resolveActiveSkills(
            context.organizationId,
            policy.brandId,
            strategy?.skillSlugs,
          )
        : [];
    const skillPromptSuffix = this.skillRuntimeService
      ? this.skillRuntimeService.buildSkillPromptSections(resolvedSkills)
      : '';

    if (shouldUseOnboardingPrompt) {
      return {
        memories,
        model: resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: ONBOARDING_SYSTEM_PROMPT,
      };
    }

    if (request.agentType === AgentType.BRAND_INTERVIEW) {
      return {
        memories,
        model: resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: BRAND_INTERVIEW_SYSTEM_PROMPT,
      };
    }

    const pageContextPrompt = buildPageContextPrompt(
      request.pageContext,
      request.artifactReferences,
    );

    if (thread?.systemPrompt) {
      const prompt = [thread.systemPrompt, skillPromptSuffix, pageContextPrompt]
        .filter(Boolean)
        .join('\n\n');
      return {
        memories,
        model: resolveModel(brandContext?.defaultModel),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: prompt,
      };
    }

    if (request.systemPromptOverride) {
      const prompt = [
        request.systemPromptOverride,
        skillPromptSuffix,
        pageContextPrompt,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        memories,
        model: resolveModel(brandContext?.defaultModel),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: prompt,
      };
    }
    const basePrompt = buildAgentSystemPrompt({
      content: request.content,
      pageContextPrompt,
      skillPromptSuffix,
      typeSuffix: agentTypeConfig?.systemPromptSuffix,
    });

    if (brandContext) {
      const systemPrompt = this.contextAssemblyService.buildSystemPrompt(
        basePrompt,
        brandContext,
        { replyStyle },
      );
      return {
        memories,
        model: resolveModel(brandContext.defaultModel),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt,
      };
    }

    if (replyStyle || agentTypeConfig?.systemPromptSuffix) {
      return {
        memories,
        model: resolveModel(),
        policy,
        preparedScope,
        resolvedSkills,
        systemPrompt: applyAgentReplyStyle(basePrompt, replyStyle),
      };
    }

    return {
      memories,
      model: resolveModel(),
      policy,
      preparedScope,
      resolvedSkills,
      systemPrompt: agentTypeConfig?.systemPromptSuffix
        ? basePrompt
        : undefined,
    };
  }

  private buildMessageHistory(
    messages: AgentMessageDocument[],
    systemPromptOverride?: string,
    memories?: AgentMemoryDocument[],
    attachments?: AgentChatAttachment[],
    compressedThreadContext?: string,
  ): OpenRouterMessage[] {
    const systemPrompt = (
      systemPromptOverride || AGENT_ORCHESTRATOR_SYSTEM_PROMPT
    ).replace('{{date}}', new Date().toISOString().split('T')[0]);

    const history: OpenRouterMessage[] = [
      { content: systemPrompt, role: 'system' },
    ];

    if (memories && memories.length > 0) {
      const preview = this.buildMemoryPromptSections(memories);

      if (preview) {
        history.push({
          content: preview,
          role: 'system',
        });
      }
    }

    // Inject compressed thread context as a user message if available
    if (compressedThreadContext) {
      history.push({
        content: compressedThreadContext,
        role: 'user',
      });
    }

    // Messages are already limited by getRecentMessages() or getMessagesAfter()
    const lastUserIndex = this.findLastUserMessageIndex(messages);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (
        msg.role === AgentMessageRole.USER ||
        msg.role === AgentMessageRole.ASSISTANT
      ) {
        const isLatestUserMessage =
          i === lastUserIndex && msg.role === AgentMessageRole.USER;

        if (isLatestUserMessage && attachments?.length) {
          history.push({
            content: [
              { text: msg.content || '', type: 'text' },
              ...attachments.map((a) => ({
                image_url: { url: a.url },
                type: 'image_url' as const,
              })),
            ],
            role: 'user',
          });
        } else {
          history.push({
            content: msg.content || '',
            role: msg.role as 'user' | 'assistant',
          });
        }
      }
    }

    return history;
  }

  /**
   * Resolve messages and optional compressed context for a thread.
   * If compaction is available, returns windowed messages + compressed context.
   * Otherwise falls back to the standard getRecentMessages(20).
   */
  private async resolveThreadMessages(
    threadId: string,
    organizationId: string,
  ): Promise<{
    messages: AgentMessageDocument[];
    compressedContext?: string;
  }> {
    if (!this.threadContextCompressorService) {
      return {
        messages: await this.agentMessagesService.getRecentMessages(threadId),
      };
    }

    const state = await this.threadContextCompressorService.getStateOrCompact(
      threadId,
      organizationId,
    );

    if (!state) {
      return {
        messages: await this.agentMessagesService.getRecentMessages(threadId),
      };
    }

    const windowMessages =
      await this.threadContextCompressorService.getWindowMessages(
        threadId,
        state.data.lastIncorporatedMessageId ?? '',
      );

    const compressedContext =
      this.threadContextCompressorService.renderStateAsUserMessage(
        state,
        windowMessages,
      );

    return { compressedContext, messages: windowMessages };
  }

  private findLastUserMessageIndex(messages: AgentMessageDocument[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === AgentMessageRole.USER) {
        return i;
      }
    }
    return -1;
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
    if (!this.isBatchGenerationIntent(requestContent)) {
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

  private isBatchGenerationIntent(content: string): boolean {
    const normalized = content.toLowerCase();

    return (
      /\b(generate|create|make|write|draft)\b/.test(normalized) &&
      /\b\d+\s+(posts?|tweets?|drafts?)\b/.test(normalized)
    );
  }

  private extractBatchGenerationDraftFromMessage(
    content: string,
    fallbackBrandId?: string | null,
  ): BatchGenerationDraft | null {
    if (!this.isBatchGenerationIntent(content)) {
      return null;
    }

    const normalized = content.toLowerCase();
    const countMatch = normalized.match(/\b(\d+)\s+(posts?|tweets?|drafts?)\b/);
    const count = Number.parseInt(countMatch?.[1] ?? '', 10);

    if (!Number.isFinite(count) || count <= 0) {
      return null;
    }

    const handle = content.match(/@\w[\w.]{1,}/)?.[0];

    if (!handle && !fallbackBrandId) {
      return null;
    }

    const topics = this.extractBatchTopics(content, normalized);

    return {
      brandId: fallbackBrandId ?? undefined,
      count,
      dateRange: this.resolveBatchDateRange(normalized),
      handle,
      platforms: this.extractBatchPlatforms(normalized, countMatch?.[2]),
      ...(topics.length > 0 ? { topics } : {}),
    };
  }

  private extractBatchPlatforms(
    normalizedContent: string,
    noun?: string,
  ): string[] {
    if (
      noun?.startsWith('tweet') ||
      /\b(?:for|on)\s+(?:x|twitter)\b/.test(normalizedContent)
    ) {
      return ['twitter'];
    }

    if (/\b(?:for|on)\s+linkedin\b/.test(normalizedContent)) {
      return ['linkedin'];
    }

    if (/\b(?:for|on)\s+instagram\b/.test(normalizedContent)) {
      return ['instagram'];
    }

    return ['twitter'];
  }

  private extractBatchTopics(
    originalContent: string,
    normalizedContent: string,
  ): string[] {
    const aboutMatch = normalizedContent.match(
      /\babout\s+(.+?)(?:\s+(?:for|on|this|next|over)\b|[.!?]|$)/,
    );

    if (!aboutMatch) {
      return [];
    }

    const startIndex = aboutMatch.index ?? -1;
    if (startIndex < 0) {
      return [];
    }

    const originalSlice = originalContent.slice(
      startIndex + 'about '.length,
      startIndex + 'about '.length + aboutMatch[1].length,
    );
    const topic = originalSlice.trim();

    return topic ? [topic] : [];
  }

  private resolveBatchDateRange(normalizedContent: string): {
    end: string;
    start: string;
  } {
    const start = new Date();
    const end = new Date(start);

    if (/\bthis month\b/.test(normalizedContent)) {
      end.setDate(end.getDate() + 30);
    } else if (/\bnext month\b/.test(normalizedContent)) {
      start.setMonth(start.getMonth() + 1, 1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);
    } else if (/\bnext week\b/.test(normalizedContent)) {
      start.setDate(start.getDate() + 7);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else {
      end.setDate(end.getDate() + 7);
    }

    return {
      end: end.toISOString(),
      start: start.toISOString(),
    };
  }

  private buildUnknownToolError(
    toolName: string,
    allowedTools: Set<AgentToolName>,
  ): string {
    const knownTools = Array.from(allowedTools).sort();
    const maxPreview = 15;
    const preview = knownTools.slice(0, maxPreview).join(', ');
    const suffix = knownTools.length > maxPreview ? ', ...' : '';

    return `Unknown tool requested by model: ${toolName}. Available tools: ${preview}${suffix}`;
  }

  private getGenerationPreparationRedirect(
    toolName: AgentToolName,
    allowedTools: Set<AgentToolName>,
  ): AgentToolName | null {
    const canPrepareGeneration = allowedTools.has(
      AgentToolName.PREPARE_GENERATION,
    );
    const isDirectGenerationTool =
      toolName === AgentToolName.GENERATE_IMAGE ||
      toolName === AgentToolName.GENERATE_VIDEO ||
      toolName === AgentToolName.GENERATE_AS_IDENTITY;

    if (canPrepareGeneration && isDirectGenerationTool) {
      return AgentToolName.PREPARE_GENERATION;
    }

    return null;
  }

  private buildUnknownToolRecoveryParams(
    requestedToolName: AgentToolName,
    toolParams: Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      requestedToolName !== AgentToolName.GENERATE_IMAGE &&
      requestedToolName !== AgentToolName.GENERATE_VIDEO &&
      requestedToolName !== AgentToolName.GENERATE_AS_IDENTITY
    ) {
      return toolParams;
    }

    const prompt =
      (toolParams.prompt as string | undefined) ||
      (toolParams.description as string | undefined) ||
      (toolParams.text as string | undefined) ||
      '';

    return {
      ...toolParams,
      generationType:
        requestedToolName === AgentToolName.GENERATE_IMAGE ? 'image' : 'video',
      prompt,
    };
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

  private async executeApprovedPlanAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
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

    return await this.executeSynchronousChatLoop({
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

  private async executeRevisedPlanAction(params: {
    context: AgentChatContext;
    model: string;
    payload?: Record<string, unknown>;
    threadId: string;
  }): Promise<AgentChatResult> {
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

    return await this.generatePlanModeResponse({
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

  private buildMemoryEntriesForResponse(memoryEntries: AgentMemoryDocument[]) {
    return memoryEntries.map((memory) => {
      const timedMemory = memory as AgentMemoryDocument & { createdAt?: Date };
      const influence = this.readMemoryInfluence(memory);

      return {
        confidence: memory.confidence,
        content: memory.content,
        contentType: memory.contentType,
        createdAt: timedMemory.createdAt?.toISOString(),
        generationInfluence: influence,
        id: memory.id,
        importance: memory.importance,
        kind: memory.kind,
        platform: memory.platform,
        scope: memory.scope,
        sourceContentId: memory.sourceContentId,
        sourceMessageId: memory.sourceMessageId,
        sourceType: memory.sourceType,
        sourceUrl: memory.sourceUrl,
        summary: memory.summary,
        tags: memory.tags ?? [],
      };
    });
  }

  private buildMemoryInfluenceMetadata(memoryEntries: AgentMemoryDocument[]) {
    const entries = this.buildMemoryEntriesForResponse(memoryEntries)
      .filter((entry) => entry.generationInfluence)
      .map((entry) => ({
        confidence: entry.confidence,
        contentType: entry.contentType,
        id: entry.id,
        kind: entry.kind,
        platform: entry.platform,
        reasons: entry.generationInfluence?.reasons ?? [],
        score: entry.generationInfluence?.score ?? 0,
        sourceType: entry.sourceType,
        summary: entry.summary || entry.content?.slice(0, 160),
      }));

    if (entries.length === 0) {
      return {
        entries: [],
        mode: 'new_exploration',
        rankingStrategy: [
          'platform',
          'contentType',
          'recency',
          'confidence',
          'performanceRelevance',
        ],
        summary:
          'No relevant prior feedback memory matched this generation request.',
      };
    }

    const winningCount = entries.filter((entry) =>
      ['pattern', 'winner', 'positive_example'].includes(String(entry.kind)),
    ).length;

    return {
      entries,
      mode: winningCount > 0 ? 'prior_winning_patterns' : 'prior_feedback',
      rankingStrategy: [
        'platform',
        'contentType',
        'recency',
        'confidence',
        'performanceRelevance',
        'queryTerms',
      ],
      summary: `Using ${entries.length} prior feedback ${
        entries.length === 1 ? 'memory' : 'memories'
      } before generation.`,
    };
  }

  private buildMemoryPromptSections(memories: AgentMemoryDocument[]): string {
    const sections = new Map<string, string[]>();
    const order = [
      'User Preferences',
      'Saved Instructions',
      'Winning Patterns',
      'Reference Examples',
      'Avoid These Patterns',
    ];

    for (const memory of memories) {
      const section = this.resolveMemorySection(memory);
      const line = this.formatMemoryLine(memory);

      if (!line) {
        continue;
      }

      const bucket = sections.get(section) ?? [];
      bucket.push(line);
      sections.set(section, bucket);
    }

    const rendered = order
      .filter((section) => sections.has(section))
      .map((section) => `## ${section}\n${sections.get(section)?.join('\n')}`)
      .join('\n\n');

    return rendered ? `Saved memory to consider:\n\n${rendered}` : '';
  }

  private resolveMemorySection(memory: AgentMemoryDocument): string {
    switch (memory.kind) {
      case 'negative_example':
        return 'Avoid These Patterns';
      case 'winner':
      case 'pattern':
        return 'Winning Patterns';
      case 'reference':
      case 'positive_example':
        return 'Reference Examples';
      case 'preference':
        return 'User Preferences';
      case 'instruction':
      default:
        return 'Saved Instructions';
    }
  }

  private formatMemoryLine(memory: AgentMemoryDocument): string {
    const base = (memory.summary || memory.content || '')
      .trim()
      .replace(/\s+/g, ' ');

    if (!base) {
      return '';
    }

    const qualifiers: string[] = [];
    if (memory.contentType && memory.contentType !== 'generic') {
      qualifiers.push(memory.contentType);
    }
    if (memory.platform) {
      qualifiers.push(memory.platform);
    }
    if (memory.scope === 'brand') {
      qualifiers.push('brand');
    }

    const prefix = qualifiers.length ? `[${qualifiers.join(' / ')}] ` : '';
    const snippet = base.length > 220 ? `${base.slice(0, 217)}...` : base;
    const influence = this.readMemoryInfluence(memory);
    const topReason = influence?.reasons[0];
    const influenceSuffix = influence
      ? ` (score ${influence.score.toFixed(1)}${topReason ? `; ${topReason}` : ''})`
      : '';
    return `- ${prefix}${snippet}${influenceSuffix}`;
  }

  private readMemoryInfluence(
    memory: AgentMemoryDocument,
  ): AgentFeedbackMemoryInfluence | undefined {
    return (memory as Partial<AgentFeedbackMemoryDocument>).generationInfluence;
  }

  private inferMemoryContentType(content: string): string {
    const normalized = content.toLowerCase();

    if (
      normalized.includes('newsletter') ||
      normalized.includes('substack') ||
      normalized.includes('beehiiv') ||
      normalized.includes('ghost')
    ) {
      return 'newsletter';
    }

    if (normalized.includes('thread')) {
      return 'thread';
    }

    if (normalized.includes('tweet') || normalized.includes('x post')) {
      return 'tweet';
    }

    if (normalized.includes('article') || normalized.includes('blog')) {
      return 'article';
    }

    if (normalized.includes('post')) {
      return 'post';
    }

    return 'generic';
  }

  /**
   * Inject campaign context (brief + recent peer messages) into the system prompt.
   * Called when a strategy is part of a campaign for coordination.
   */
  private async injectCampaignContext(
    campaignId: string,
    organizationId: string,
    existingPrompt: string | undefined,
  ): Promise<string | undefined> {
    try {
      const campaign = await this.agentCampaignsService?.findOneById(
        campaignId,
        organizationId,
      );

      if (!campaign) {
        return existingPrompt;
      }

      const recentMessages =
        await this.agentMessageBusService?.getRecentMessages(campaignId, 10);

      const campaignSection = [
        '\n\n## Campaign Coordination',
        `You are part of campaign: "${campaign.label}"`,
        campaign.brief ? `Campaign Brief: ${campaign.brief}` : '',
        `Campaign Status: ${campaign.status}`,
        `Credits Used: ${campaign.creditsUsed} / ${campaign.creditsAllocated} allocated`,
        campaign.agents.length > 1
          ? `Other agents in this campaign: ${campaign.agents.length - 1}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      let peerMessagesSection = '';
      if (recentMessages && recentMessages.length > 0) {
        const messageLines = recentMessages.map(
          (msg) =>
            `- [${msg.type}] Agent ${msg.agentId}: ${JSON.stringify(msg.payload)}`,
        );
        peerMessagesSection = `\n\n## Recent Peer Activity\n${messageLines.join('\n')}`;
      }

      const basePrompt = existingPrompt || '';
      return `${basePrompt}${campaignSection}${peerMessagesSection}`;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to inject campaign context`,
        error,
      );
      return existingPrompt;
    }
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
    const artifactMetadata = buildAgentArtifactCompletionMetadata(
      params.result.data,
      {
        brandId: params.context.scope?.brandId,
        organizationId: params.context.organizationId,
      },
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

    await this.persistRunArtifactMetadata(params.context, artifactMetadata);
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

  private buildPlanningChatCompletionParams(params: {
    messages: OpenRouterMessage[];
    model: string;
    prompt: string;
    seedTitle?: string;
    source?: AgentChatRequest['source'];
  }): {
    max_tokens: number;
    messages: OpenRouterMessage[];
    model: string;
    plugins?: OpenRouterPlugin[];
    temperature: number;
  } {
    const routingPolicy = resolveAgentRoutingPolicy({
      model: params.model,
      prompt: params.prompt,
      source: params.source,
    });
    const plugins = resolveAgentRoutingPlugins(routingPolicy);
    const planInstruction = {
      content:
        'Plan mode is enabled. Do not call tools or execute work. Respond with valid JSON only: {"title":"optional thread title","summary":"one short summary sentence","explanation":"brief rationale","content":"markdown plan","steps":[{"step":"...", "status":"pending"}]}. Keep the plan concise and execution-ready.',
      role: 'system' as const,
    };

    return {
      max_tokens: 2048,
      messages: [planInstruction, ...params.messages],
      model: params.model,
      ...(plugins ? { plugins } : {}),
      temperature: 0.3,
    };
  }

  private extractPlanEnvelope(params: {
    assistantContent: string;
    prompt: string;
    seedTitle: string;
  }): {
    title: string | null;
    summary: string;
    plan: {
      id: string;
      content: string;
      explanation?: string;
      steps?: Record<string, unknown>[];
      status: 'awaiting_approval';
      awaitingApproval: true;
    };
  } {
    const trimmed = params.assistantContent.trim();
    const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmed;
    let parsed: Record<string, unknown> | null = null;

    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      try {
        parsed = JSON.parse(candidate) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    const content =
      typeof parsed?.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : candidate;
    const explanation =
      typeof parsed?.explanation === 'string' && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : undefined;
    const summary =
      typeof parsed?.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : 'I drafted a plan and paused for your approval.';
    const title =
      typeof parsed?.title === 'string' && parsed.title.trim()
        ? this.sanitizeGeneratedThreadTitle(parsed.title.trim(), params.prompt)
        : params.seedTitle.trim()
          ? this.buildFallbackThreadTitle(params.prompt)
          : null;
    const steps = Array.isArray(parsed?.steps)
      ? (parsed?.steps as Record<string, unknown>[])
      : undefined;

    return {
      plan: {
        awaitingApproval: true,
        content,
        ...(explanation ? { explanation } : {}),
        id: `plan-${Date.now()}`,
        status: 'awaiting_approval',
        ...(steps ? { steps } : {}),
      },
      summary,
      title,
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

  private async persistRunArtifactMetadata(
    context: AgentChatContext,
    metadata: AgentArtifactCompletionMetadata,
  ): Promise<void> {
    if (
      !context.runId ||
      (!metadata.artifactReferences?.length &&
        !metadata.artifactVersionPinIds?.length)
    ) {
      return;
    }

    await this.agentRunsService.mergeMetadata(
      context.runId,
      context.organizationId,
      metadata,
    );
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
