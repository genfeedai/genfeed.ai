import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { scopedWhere } from '@api/index';
import { AgentAutoModelResolverService } from '@api/services/agent-orchestrator/agent-auto-model-resolver.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentOrchestratorTurboRunService } from '@api/services/agent-orchestrator/agent-orchestrator-turbo-run.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import {
  AgentTurnRoundRunnerService,
  assertAgentCreditBudget,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import { AGENT_MAX_TOOL_ROUNDS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import type {
  AgentChatAttachment,
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type {
  StreamAssistantMessage,
  StreamInferenceRound,
  StreamLoopParams,
  StreamLoopState,
  StreamRoundOutcome,
  StreamTurnInputs,
} from '@api/services/agent-orchestrator/interfaces/agent-orchestrator-stream-loop.interface';
import { mergeAgentArtifactCompletionMetadata } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { resolveAgentAutoRoutingRound } from '@api/services/agent-orchestrator/utils/agent-auto-routing-round.util';
import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';
import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import { buildPersistedAgentResponseMetadata } from '@api/services/agent-orchestrator/utils/agent-persisted-response-metadata.util';
import { toPersistedToolCalls } from '@api/services/agent-orchestrator/utils/agent-persisted-tool-calls.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import {
  AGENT_WRAP_UP_INSTRUCTION,
  isAgentWrapUpRound,
} from '@api/services/agent-orchestrator/utils/agent-round-budget.util';
import { buildAgentRoutingMetadata } from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import { readAgentRunPublicError } from '@api/services/agent-orchestrator/utils/agent-run-failure.util';
import { buildAgentScopeMetadata } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import { buildStreamToolRoundStrategy } from '@api/services/agent-orchestrator/utils/agent-stream-tool-round-strategy.util';
import {
  extractThreadEnvelope,
  maybeUpdateThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import {
  buildAgentChatCompletionParams,
  buildToolDefinitions,
  mergeAllowedTools,
  resolveBlockedTools,
  TURBO_RUN_SCOPED_ALLOWED_TOOLS,
} from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import {
  AGENT_UNPRODUCED_DRAFTS_INSTRUCTION,
  claimsUnproducedDrafts,
} from '@api/services/agent-orchestrator/utils/agent-unproduced-drafts.util';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import type { CuratedActionName } from '@genfeedai/actions';
import {
  AgentMessageRole,
  AgentType,
  type RouterPriority,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, Optional } from '@nestjs/common';

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

@Traced()
@Injectable()
export class AgentOrchestratorStreamLoopService {
  private readonly constructorName = String(this.constructor.name);
  private readonly activeStreams = new Set<string>();

  constructor(
    private readonly loggerService: LoggerService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly turnRoundRunner: AgentTurnRoundRunnerService,
    private readonly turboRunService: AgentOrchestratorTurboRunService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly streamEffects: AgentStreamEffectsService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    private readonly autoModelResolver: AgentAutoModelResolverService,
    @Optional()
    private readonly skillRuntimeService?: SkillRuntimeService,
    @Optional()
    private readonly platformSettingsService?: PlatformSettingsService,
  ) {}

  /** An operator platform setting (#5407); off when settings are not wired. */
  private async isRealTokenStreamingEnabled(): Promise<boolean> {
    if (!this.platformSettingsService) {
      return false;
    }
    const settings = await this.platformSettingsService.getFeatureSettings();
    return settings.isAgentTokenStreamingEnabled;
  }

  private async publishStreamDelta(
    context: AgentChatContext,
    threadId: string,
    delta: string,
    counters: {
      lastCancelCheckAt: number;
      lastPublishErrorLoggedAt: number;
      roundStreamedTokenCount: number;
    },
  ): Promise<void> {
    counters.roundStreamedTokenCount++;
    const now = Date.now();
    if (now - counters.lastCancelCheckAt >= STREAM_CANCEL_CHECK_INTERVAL_MS) {
      counters.lastCancelCheckAt = now;
      if (await this.isRunCancelled(context)) {
        throw new StreamCancelledError();
      }
    }
    try {
      await this.streamEffects.publishStreamToken({
        runId: context.executionId,
        threadId,
        token: delta,
        userId: context.userId,
      });
    } catch (error) {
      const errorAt = Date.now();
      if (
        errorAt - counters.lastPublishErrorLoggedAt >=
        STREAM_PUBLISH_LOG_INTERVAL_MS
      ) {
        counters.lastPublishErrorLoggedAt = errorAt;
        this.loggerService.warn(
          `${this.constructorName} stream token publish failed (throttled)`,
          {
            error: error instanceof Error ? error.message : String(error),
            threadId,
          },
        );
      }
    }
  }

  async runStreamLoop(
    context: AgentChatContext,
    threadId: string,
    systemPromptOverride: string | undefined,
    model: string,
    turnCost: number,
    resolvedPolicy: ResolvedAgentExecutionPolicy,
    generationPriority: RouterPriority,
    memoryEntries: AgentMemoryDocument[],
    agentType?: AgentType,
    source?: AgentChatRequest['source'],
    seedTitle?: string,
    runStartedAt?: string,
    attachments?: AgentChatAttachment[],
  ): Promise<void> {
    const params: StreamLoopParams = {
      agentType,
      attachments,
      context,
      generationPriority,
      memoryEntries,
      model,
      resolvedPolicy,
      runStartedAt,
      seedTitle,
      source,
      systemPromptOverride,
      threadId,
      turnCost,
    };
    this.activeStreams.add(threadId);
    const state: StreamLoopState = {
      actualModels: new Set<string>(),
      hasPreviousRoundUsedTools: false,
      hasRequestedUnproducedDrafts: false,
      latestAutoRouting: undefined,
      latestProviderUsage: {
        completion_tokens: 0,
        prompt_tokens: 0,
        total_tokens: 0,
      },
      roundCredits: 0,
      terminalContent: undefined,
      toolRoundState: {
        artifactMetadata: [],
        highestRiskLevel: 'low',
        latestUiBlocks: null,
        reviewRequired: false,
        toolCalls: [],
        totalCreditsUsed: 0,
        uiActions: [],
      },
    };

    try {
      await this.executeStreamLoop(params, state);
    } catch (error: unknown) {
      await this.handleStreamLoopFailure(params, state, error);
    } finally {
      this.activeStreams.delete(threadId);
    }
  }

  private async settleAccruedTurnCredits(
    state: StreamLoopState,
  ): Promise<number> {
    const creditsToSettle = state.roundCredits;
    // A settlement failure must not make the outer catch retry a possibly
    // committed ledger write. Every settlement path is terminal.
    state.roundCredits = 0;
    return creditsToSettle;
  }

  private async executeStreamLoop(
    params: StreamLoopParams,
    state: StreamLoopState,
  ): Promise<void> {
    const { context, threadId, model, runStartedAt } = params;
    await this.streamEffects.publishStreamLifecycleStarted({
      context,
      model,
      startedAt: runStartedAt,
      threadId,
    });

    const inputs = await this.prepareStreamTurnInputs(params);
    let round = 0;

    // Credits accrue per completed round, not per turn: a turn that burns
    // N tool rounds costs N rounds of inference and has to bill like it.
    while (round < AGENT_MAX_TOOL_ROUNDS || state.terminalContent) {
      if (await this.isRunCancelled(context)) {
        state.toolRoundState.totalCreditsUsed +=
          await this.settleAccruedTurnCredits(state);
        await this.handleCancelledStream(context, threadId);
        return;
      }
      round++;

      const outcome = await this.runStreamRound(params, state, inputs, round);
      if (outcome === 'finished') {
        return;
      }
    }

    // Overflowing the round budget still consumed every one of those rounds
    // at the provider — settle them before surfacing the failure, or a turn
    // that runs away is the cheapest turn on the platform.
    await this.settleAccruedTurnCredits(state);

    const errorMsg = `Agent exceeded maximum tool-calling rounds (${AGENT_MAX_TOOL_ROUNDS})`;
    if (context.executionMode === 'background') {
      throw new Error(errorMsg);
    }
    await this.streamEffects.publishStreamFailure({
      context,
      error: errorMsg,
      threadId,
    });
  }

  private async handleStreamLoopFailure(
    params: StreamLoopParams,
    state: StreamLoopState,
    error: unknown,
  ): Promise<void> {
    const { context, threadId } = params;
    state.toolRoundState.totalCreditsUsed +=
      await this.settleAccruedTurnCredits(state);
    if (await this.isRunCancelled(context)) {
      await this.handleCancelledStream(context, threadId);
      return;
    }

    this.loggerService.error(`${this.constructorName} streaming chat failed`, {
      error: error instanceof Error ? error.message : error,
      organizationId: context.organizationId,
      userId: context.userId,
    });

    // A queue-owned attempt is not terminal until BullMQ exhausts its retry
    // budget. Propagate the provider/tool failure without recording a
    // run.failed event; the processor owns the one durable terminal outcome.
    if (context.executionMode === 'background') {
      throw error;
    }

    await this.streamEffects.publishStreamFailure({
      context,
      error: readAgentRunPublicError(error),
      threadId,
    });
  }

  private async prepareStreamTurnInputs(
    params: StreamLoopParams,
  ): Promise<StreamTurnInputs> {
    const {
      agentType,
      attachments,
      context,
      memoryEntries,
      seedTitle,
      source,
      systemPromptOverride,
      threadId,
    } = params;
    const memoryEntriesForResponse =
      this.contextService.buildMemoryEntriesForResponse(memoryEntries);
    const memoryInfluence =
      this.contextService.buildMemoryInfluenceMetadata(memoryEntries);

    // Build thread history from separate messages collection
    const { messages: recentMessages, compressedContext: streamCompressedCtx } =
      await this.contextService.resolveThreadMessages(
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
          ) as CuratedActionName[] | undefined)
        : typeConfig?.defaultTools;
    const latestUserMessage =
      [...history]
        .reverse()
        .find((message) => message.role === 'user')
        ?.content?.toString?.() ?? '';
    const scopedTools =
      source !== 'proactive' &&
      this.turboRunService.isTurboRunIntent(latestUserMessage)
        ? TURBO_RUN_SCOPED_ALLOWED_TOOLS
        : undefined;
    const tools = buildToolDefinitions(
      mergeAllowedTools(baseTools, scopedTools),
      resolveBlockedTools(),
    );
    const allowedToolNames = new Set(
      tools.map((tool) => tool.function.name as CuratedActionName),
    );

    // Real token streaming is skipped for title-seeding turns (seedTitle set,
    // first message of a new thread) because the model returns a JSON
    // {title, content} envelope there — streaming raw deltas would flash JSON
    // at the user. Those turns keep the simulated word-split path.
    const canStreamLiveTokens =
      !(seedTitle ?? '').trim() && (await this.isRealTokenStreamingEnabled());

    return {
      allowedToolNames,
      canStreamLiveTokens,
      latestUserMessage,
      memoryEntriesForResponse,
      memoryInfluence,
      messages: [...history],
      tools,
    };
  }

  private async runStreamRound(
    params: StreamLoopParams,
    state: StreamLoopState,
    inputs: StreamTurnInputs,
    round: number,
  ): Promise<StreamRoundOutcome> {
    const { context, threadId } = params;
    const inference = await this.runStreamInferenceRound(
      params,
      state,
      inputs,
      round,
    );
    if (!inference) {
      await this.handleCancelledStream(context, threadId);
      return 'finished';
    }

    const choice = inference.response.choices[0];
    if (!choice) {
      throw new Error('No response from LLM');
    }

    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls;
    state.hasPreviousRoundUsedTools = Boolean(toolCalls?.length);

    // No tool calls — final response
    if (!toolCalls || toolCalls.length === 0) {
      return this.handleStreamFinalResponse(
        params,
        state,
        inputs,
        inference,
        assistantMessage,
      );
    }

    return this.runStreamToolRound(
      params,
      state,
      inputs,
      assistantMessage,
      toolCalls,
    );
  }

  /** Returns null when the run was cancelled mid-stream. */
  private async runStreamInferenceRound(
    params: StreamLoopParams,
    state: StreamLoopState,
    inputs: StreamTurnInputs,
    round: number,
  ): Promise<StreamInferenceRound | null> {
    const {
      context,
      generationPriority,
      model,
      seedTitle,
      source,
      threadId,
      turnCost,
    } = params;
    const { latestUserMessage, messages, tools } = inputs;
    const { toolRoundState } = state;

    const isWrapUpRound =
      !state.terminalContent &&
      isAgentWrapUpRound(round, AGENT_MAX_TOOL_ROUNDS);
    if (isWrapUpRound) {
      messages.push({ content: AGENT_WRAP_UP_INSTRUCTION, role: 'system' });
    }

    const maximumRoundCredits =
      state.terminalContent || turnCost === 0
        ? 0
        : await this.agentChatModelRegistry.getMaximumRoundCredits(model);
    if (!state.terminalContent)
      assertAgentCreditBudget(
        context,
        toolRoundState.totalCreditsUsed + state.roundCredits,
        maximumRoundCredits,
      );
    // Auto-routing decision inputs (#4865): the tier depends on how the turn
    // has behaved so far, not only on the opening message.
    const { defaultModelKey, dispatchedModel, resolution } =
      await resolveAgentAutoRoutingRound({
        context,
        hasPreviousRoundUsedTools: state.hasPreviousRoundUsedTools,
        hasToolsAvailable: tools.length > 0,
        isTerminalRound: Boolean(state.terminalContent),
        latestUserMessage,
        model,
        modelRegistry: this.agentChatModelRegistry,
        previous: state.latestAutoRouting,
        prioritize: generationPriority,
        resolver: this.autoModelResolver,
        roundNumber: round,
        source,
        threadId,
      });
    state.latestAutoRouting = resolution;

    const chatParams = buildAgentChatCompletionParams({
      autoAllowedModelKeys:
        await this.agentChatModelRegistry.getAutoAllowedModelKeys(),
      defaultModelKey,
      dispatchModelKey: state.latestAutoRouting?.dispatchModelKey,
      isWebSearchNeeded: state.latestAutoRouting?.isWebSearchNeeded,
      messages,
      model,
      prompt: latestUserMessage,
      prioritize: generationPriority,
      seedTitle: seedTitle ?? '',
      source,
      toolChoice: isWrapUpRound ? 'none' : 'auto',
      tools,
      sessionId: threadId,
    });

    // Real deltas published live during this round; drives whether the
    // final branch re-simulates word-split streaming or not.
    const streamCounters = {
      lastCancelCheckAt: 0,
      lastPublishErrorLoggedAt: 0,
      roundStreamedTokenCount: 0,
    };
    const onStreamToken = (delta: string) =>
      this.publishStreamDelta(context, threadId, delta, streamCounters);

    const isTerminalCompletion = Boolean(state.terminalContent);
    const reservedRound = state.terminalContent
      ? {
          credits: 0,
          response: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: state.terminalContent,
                  role: 'assistant',
                },
              },
            ],
            id: `terminal-tool-${context.executionId ?? threadId}`,
            usage: state.latestProviderUsage,
          } satisfies OpenRouterChatCompletionResponse,
        }
      : await this.reserveStreamInferenceRound({
          chatParams,
          dispatchedModel,
          maximumRoundCredits,
          onStreamToken,
          params,
          round,
          canStreamLiveTokens: inputs.canStreamLiveTokens,
        });
    state.terminalContent = undefined;

    if (!reservedRound) {
      return null;
    }
    const response: OpenRouterChatCompletionResponse = reservedRound.response;
    if (!isTerminalCompletion) {
      state.latestProviderUsage = response.usage;
      const actualModel = await this.turnRoundRunner.recordAgentResponseModel({
        actualModels: Array.from(state.actualModels),
        context,
        requestedModel: model,
        responseModel: response.model,
        executionId: context.executionId,
        source,
        threadId,
      });
      state.actualModels.add(actualModel);
      state.roundCredits += reservedRound.credits;
    }

    return {
      defaultModelKey,
      response,
      streamedTokenCount: streamCounters.roundStreamedTokenCount,
    };
  }

  /**
   * Reserves credits and dispatches one inference round. A mid-stream
   * cancellation (StreamCancelledError thrown from onStreamToken) resolves to
   * null so the caller routes it to the cancelled-stream handler; any other
   * error still propagates as a real failure.
   */
  private async reserveStreamInferenceRound(input: {
    canStreamLiveTokens: boolean;
    chatParams: ReturnType<typeof buildAgentChatCompletionParams>;
    dispatchedModel: string;
    maximumRoundCredits: number;
    onStreamToken: (delta: string) => Promise<void>;
    params: StreamLoopParams;
    round: number;
  }): Promise<{
    credits: number;
    response: OpenRouterChatCompletionResponse;
  } | null> {
    const { chatParams, dispatchedModel, maximumRoundCredits } = input;
    const { params, round } = input;
    const { context, threadId, turnCost } = params;
    const dispatchContext = {
      brandId: context.scope?.brandId,
      runId: context.executionId,
      threadId,
      userId: context.userId,
    };
    try {
      return await runReservedAgentLlmRound({
        actorUserId: context.userId,
        brandId: context.scope?.brandId,
        credits: this.creditsUtilsService,
        idempotencyKey: `${context.executionId ?? threadId}:agent-llm-round:${round}`,
        maximumCredits: maximumRoundCredits,
        organizationId: context.organizationId,
        pricer: this.agentChatModelRegistry,
        requestedModel: dispatchedModel,
        run: () =>
          input.canStreamLiveTokens
            ? this.llmDispatcher.streamChatCompletionAggregated(
                chatParams,
                context.organizationId,
                input.onStreamToken,
                dispatchContext,
              )
            : this.llmDispatcher.chatCompletion(
                chatParams,
                context.organizationId,
                dispatchContext,
              ),
        waived: turnCost === 0,
      });
    } catch (error) {
      if (error instanceof StreamCancelledError) {
        return null;
      }
      throw error;
    }
  }

  private async handleStreamFinalResponse(
    params: StreamLoopParams,
    state: StreamLoopState,
    inputs: StreamTurnInputs,
    inference: StreamInferenceRound,
    assistantMessage: StreamAssistantMessage,
  ): Promise<StreamRoundOutcome> {
    const { context, seedTitle, threadId } = params;
    const { latestUserMessage, messages } = inputs;
    const { toolRoundState } = state;

    if (await this.isRunCancelled(context)) {
      toolRoundState.totalCreditsUsed +=
        await this.settleAccruedTurnCredits(state);
      await this.handleCancelledStream(context, threadId);
      return 'finished';
    }

    if (
      !state.hasRequestedUnproducedDrafts &&
      claimsUnproducedDrafts(
        sanitizeAgentOutputText(assistantMessage.content || ''),
        toolRoundState.toolCalls,
        toolRoundState.uiActions,
      )
    ) {
      state.hasRequestedUnproducedDrafts = true;
      messages.push(
        { content: assistantMessage.content ?? '', role: 'assistant' },
        { content: AGENT_UNPRODUCED_DRAFTS_INSTRUCTION, role: 'system' },
      );
      return 'continue';
    }

    const threadEnvelope = extractThreadEnvelope({
      assistantContent: sanitizeAgentOutputText(assistantMessage.content || ''),
      prompt: latestUserMessage,
      seedTitle: seedTitle ?? '',
    });
    const normalizedContent = normalizeFinalAssistantContent(
      threadEnvelope.content,
      toolRoundState.toolCalls,
      toolRoundState.uiActions,
    );
    const citations = await this.turnRoundRunner.finalizeKnowledgeCitations(
      normalizedContent.content,
      toolRoundState,
      context,
    );

    toolRoundState.totalCreditsUsed +=
      await this.settleAccruedTurnCredits(state);

    const appliedThreadTitle = await maybeUpdateThreadTitle({
      agentThreadsService: this.agentThreadsService,
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

    if (await this.isRunCancelled(context)) {
      await this.handleCancelledStream(context, threadId);
      return 'finished';
    }

    await this.publishStreamFinalResponse({
      appliedThreadTitle,
      citations,
      creditsRemaining,
      inference,
      inputs,
      isFallbackContent: normalizedContent.isFallback,
      params,
      reasoning,
      state,
    });
    return 'finished';
  }

  private async publishStreamFinalResponse(input: {
    appliedThreadTitle: string | null | undefined;
    citations: Awaited<
      ReturnType<AgentTurnRoundRunnerService['finalizeKnowledgeCitations']>
    >;
    creditsRemaining: number;
    inference: StreamInferenceRound;
    inputs: StreamTurnInputs;
    isFallbackContent: boolean;
    params: StreamLoopParams;
    reasoning: string | null;
    state: StreamLoopState;
  }): Promise<void> {
    const { appliedThreadTitle, citations, creditsRemaining, inference } =
      input;
    const { inputs, isFallbackContent, params, reasoning, state } = input;
    const { context, model, runStartedAt, threadId } = params;
    const { toolRoundState } = state;
    const { memoryEntriesForResponse, memoryInfluence } = inputs;
    const content = citations.content;

    await this.streamEffects.publishStreamAssistantResponse({
      content,
      context,
      reasoning,
      // When this round already streamed real deltas live, don't
      // re-emit the content as simulated word-split tokens.
      suppressTokenStreaming: inference.streamedTokenCount > 0,
      threadId,
    });

    const enhancedUiActions =
      this.completionCardBuilder.buildAssistantUiActions({
        reviewRequired: toolRoundState.reviewRequired,
        toolCalls: toolRoundState.toolCalls,
        uiActions: toolRoundState.uiActions,
      });
    const artifactMetadata = mergeAgentArtifactCompletionMetadata(
      toolRoundState.artifactMetadata,
    );

    // Save assistant message to DB. The enclosing workflow result owns
    // artifact provenance; the message keeps the user-facing projection.
    await this.agentMessagesService.addMessage({
      brandId: context.scope?.brandId,
      content,
      metadata: buildPersistedAgentResponseMetadata(
        {
          ...artifactMetadata,
          ...buildAgentScopeMetadata(context),
          ...buildAgentRoutingMetadata({
            autoRouting: state.latestAutoRouting,
            defaultModelKey: inference.defaultModelKey,
            model,
            prompt: inputs.latestUserMessage,
          }),
          isFallbackContent,
          ...citations.metadata,
          memoryEntries: memoryEntriesForResponse,
          memoryInfluence,
          ...buildResolvedModelMetadata(model, Array.from(state.actualModels)),
          reasoning,
          reviewRequired: toolRoundState.reviewRequired,
          riskLevel: toolRoundState.highestRiskLevel,
          ...(enhancedUiActions.suggestedActions.length
            ? { suggestedActions: enhancedUiActions.suggestedActions }
            : {}),
          totalCreditsUsed: toolRoundState.totalCreditsUsed,
          uiActions: enhancedUiActions.uiActions,
        },
        creditsRemaining,
        context.executionId,
        inference.response.usage,
      ),
      organizationId: context.organizationId,
      role: AgentMessageRole.ASSISTANT,
      room: threadId,
      toolCalls: toPersistedToolCalls(toolRoundState.toolCalls),
      userId: context.userId,
    });

    await this.streamEffects.publishStreamCompletion({
      completionMetadata: {
        isFallbackContent,
        ...citations.metadata,
        memoryEntries: memoryEntriesForResponse,
        memoryInfluence,
        ...buildResolvedModelMetadata(model, Array.from(state.actualModels)),
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
      runStartedAt,
      threadId,
      ...(appliedThreadTitle ? { threadTitle: appliedThreadTitle } : {}),
      toolCalls: toolRoundState.toolCalls,
    });
  }

  private async runStreamToolRound(
    params: StreamLoopParams,
    state: StreamLoopState,
    inputs: StreamTurnInputs,
    assistantMessage: StreamAssistantMessage,
    toolCalls: NonNullable<StreamAssistantMessage['tool_calls']>,
  ): Promise<StreamRoundOutcome> {
    const {
      attachments,
      context,
      generationPriority,
      model,
      resolvedPolicy,
      source,
      threadId,
    } = params;
    const { toolRoundState } = state;

    toolRoundState.totalCreditsUsed +=
      await this.settleAccruedTurnCredits(state);
    const toolRoundResult = await this.turnRoundRunner.executeToolRound({
      allowedToolNames: inputs.allowedToolNames,
      assistantContent: assistantMessage.content,
      attachmentUrls: attachments?.map((a) => a.url),
      context,
      generationPriority,
      messages: inputs.messages,
      model,
      policy: resolvedPolicy,
      source,
      state: toolRoundState,
      strategy: buildStreamToolRoundStrategy({
        context,
        isRunCancelled: () => this.isRunCancelled(context),
        streamEffects: this.streamEffects,
        threadId,
      }),
      thinkingModel: resolvedPolicy.thinkingModelOverride ?? undefined,
      threadId,
      toolCalls,
    });

    const interrupted = toolRoundResult.wasInterrupted;
    if (toolRoundResult.isCancelled) {
      toolRoundState.totalCreditsUsed +=
        await this.settleAccruedTurnCredits(state);
      await this.handleCancelledStream(context, threadId, interrupted);
      return 'finished';
    }
    state.terminalContent = toolRoundResult.terminalContent;
    return 'continue';
  }

  private async isRunCancelled(context: AgentChatContext): Promise<boolean> {
    if (!context.executionId) {
      return false;
    }

    const execution = await this.workflowExecutionsService.findOneSelect(
      scopedWhere(context.organizationId, { id: context.executionId }),
      { status: true },
    );
    return execution?.status === WorkflowExecutionStatus.CANCELLED;
  }

  private async handleCancelledStream(
    context: AgentChatContext,
    threadId: string,
    interrupted = false,
  ): Promise<void> {
    await this.streamEffects.publishStreamCancelled(
      context,
      threadId,
      interrupted,
    );
  }
}
