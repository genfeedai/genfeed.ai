import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { scopedWhere } from '@api/index';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import {
  type AgentToolRoundState,
  AgentTurnRoundRunnerService,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import { AGENT_MAX_TOOL_ROUNDS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import type {
  AgentChatAttachment,
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { mergeAgentArtifactCompletionMetadata } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';
import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import { buildAgentRoutingMetadata } from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import {
  classifyAgentRunFailure,
  readAgentRunPublicError,
} from '@api/services/agent-orchestrator/utils/agent-run-failure.util';
import { buildAgentScopeMetadata } from '@api/services/agent-orchestrator/utils/agent-scope-metadata.util';
import {
  extractThreadEnvelope,
  maybeUpdateThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import {
  BATCH_SCOPED_ALLOWED_TOOLS,
  buildAgentChatCompletionParams,
  buildToolDefinitions,
  mergeAllowedTools,
  resolveBlockedTools,
} from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
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
import { type AgentUIBlocksEvent } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
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
    private readonly batchService: AgentOrchestratorBatchService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly streamEffects: AgentStreamEffectsService,
    private readonly workflowExecutionsService: WorkflowExecutionsService,
    @Optional()
    private readonly skillRuntimeService?: SkillRuntimeService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  private isRealTokenStreamingEnabled(): boolean {
    return this.configService?.get('AGENT_TOKEN_STREAMING_ENABLED') === 'true';
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
    this.activeStreams.add(threadId);
    const toolRoundState: AgentToolRoundState = {
      artifactMetadata: [],
      highestRiskLevel: 'low',
      latestUiBlocks: null,
      reviewRequired: false,
      toolCalls: [],
      totalCreditsUsed: 0,
      uiActions: [],
    };
    const actualModels = new Set<string>();
    let roundCredits = 0;

    const settleAccruedTurnCredits = async (): Promise<number> => {
      const creditsToSettle = roundCredits;
      // A settlement failure must not make the outer catch retry a possibly
      // committed ledger write. Every settlement path is terminal.
      roundCredits = 0;

      return creditsToSettle;
    };

    try {
      await this.streamEffects.publishStreamLifecycleStarted({
        context,
        model,
        startedAt: runStartedAt,
        threadId,
      });

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
            ) as CuratedActionName[] | undefined)
          : typeConfig?.defaultTools;
      const latestUserMessage =
        [...history]
          .reverse()
          .find((message) => message.role === 'user')
          ?.content?.toString?.() ?? '';
      const scopedTools = this.batchService.isBatchGenerationIntent(
        latestUserMessage,
      )
        ? BATCH_SCOPED_ALLOWED_TOOLS
        : undefined;
      const tools = buildToolDefinitions(
        mergeAllowedTools(baseTools, scopedTools),
        resolveBlockedTools({ source }),
      );
      const allowedToolNames = new Set(
        tools.map((tool) => tool.function.name as CuratedActionName),
      );
      const messages = [...history];
      let round = 0;
      let terminalContent: string | undefined;
      let latestProviderUsage = {
        completion_tokens: 0,
        prompt_tokens: 0,
        total_tokens: 0,
      };
      // Credits accrue per completed round, not per turn: a turn that burns
      // five tool rounds costs five rounds of inference and has to bill like it.

      // Real token streaming is skipped for title-seeding turns (seedTitle set,
      // first message of a new thread) because the model returns a JSON
      // {title, content} envelope there — streaming raw deltas would flash JSON
      // at the user. Those turns keep the simulated word-split path.
      const canStreamLiveTokens =
        this.isRealTokenStreamingEnabled() && !(seedTitle ?? '').trim();

      while (round < AGENT_MAX_TOOL_ROUNDS || terminalContent) {
        if (await this.isRunCancelled(context)) {
          toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();
          await this.handleCancelledStream(context, threadId);
          return;
        }
        round++;

        const chatParams = buildAgentChatCompletionParams({
          autoAllowedModelKeys:
            await this.agentChatModelRegistry.getAutoAllowedModelKeys(),
          defaultModelKey:
            await this.agentChatModelRegistry.getDefaultModelKey(),
          messages,
          model,
          prompt: latestUserMessage,
          prioritize: generationPriority,
          seedTitle: seedTitle ?? '',
          source,
          tools,
          sessionId: threadId,
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

          try {
            await this.streamEffects.publishStreamToken({
              runId: context.executionId,
              threadId,
              token: delta,
              userId: context.userId,
            });
          } catch (error) {
            // Keep swallowing publish failures (a transient Redis hiccup must
            // not abort a live stream) but surface a throttled log so a
            // sustained outage is diagnosable rather than silent.
            const errorAt = Date.now();
            if (
              errorAt - lastPublishErrorLoggedAt >=
              STREAM_PUBLISH_LOG_INTERVAL_MS
            ) {
              lastPublishErrorLoggedAt = errorAt;
              this.loggerService.warn(
                `${this.constructorName} stream token publish failed (throttled)`,
                {
                  error: error instanceof Error ? error.message : String(error),
                  threadId,
                },
              );
            }
          }
        };

        // IIFE so a mid-stream cancellation (StreamCancelledError thrown from
        // onStreamToken) is caught here and routed to the cancelled-stream
        // handler; any other error still propagates as a real failure.
        const isTerminalCompletion = Boolean(terminalContent);
        const reservedRound: {
          credits: number;
          response: OpenRouterChatCompletionResponse;
        } | null = terminalContent
          ? {
              credits: 0,
              response: {
                choices: [
                  {
                    finish_reason: 'stop',
                    message: {
                      content: terminalContent,
                      role: 'assistant',
                    },
                  },
                ],
                id: `terminal-tool-${context.executionId ?? threadId}`,
                usage: latestProviderUsage,
              },
            }
          : await (async () => {
              try {
                return await runReservedAgentLlmRound({
                  actorUserId: context.userId,
                  credits: this.creditsUtilsService,
                  estimatedCredits: (actualModel) =>
                    this.agentChatModelRegistry.getRoundCredits(actualModel),
                  idempotencyKey: `${context.executionId ?? threadId}:agent-llm-round:${round}`,
                  maximumCredits:
                    await this.agentChatModelRegistry.getMaximumRoundCredits(
                      model,
                    ),
                  organizationId: context.organizationId,
                  requestedModel: model,
                  run: () =>
                    canStreamLiveTokens
                      ? this.llmDispatcher.streamChatCompletionAggregated(
                          chatParams,
                          context.organizationId,
                          onStreamToken,
                          {
                            brandId: context.scope?.brandId,
                            runId: context.executionId,
                            threadId,
                            userId: context.userId,
                          },
                        )
                      : this.llmDispatcher.chatCompletion(
                          chatParams,
                          context.organizationId,
                          {
                            brandId: context.scope?.brandId,
                            runId: context.executionId,
                            threadId,
                            userId: context.userId,
                          },
                        ),
                  waived: turnCost === 0,
                });
              } catch (error) {
                if (error instanceof StreamCancelledError) {
                  return null;
                }
                throw error;
              }
            })();
        terminalContent = undefined;

        if (!reservedRound) {
          await this.handleCancelledStream(context, threadId);
          return;
        }
        const response = reservedRound.response;
        if (!isTerminalCompletion) {
          latestProviderUsage = response.usage;
          const actualModel =
            await this.turnRoundRunner.recordAgentResponseModel({
              actualModels: Array.from(actualModels),
              context,
              requestedModel: model,
              responseModel: response.model,
              executionId: context.executionId,
              source,
              threadId,
            });
          actualModels.add(actualModel);
          roundCredits += reservedRound.credits;
        }

        const choice = response.choices[0];
        if (!choice) {
          throw new Error('No response from LLM');
        }

        const assistantMessage = choice.message;
        const toolCalls = assistantMessage.tool_calls;

        // No tool calls — final response
        if (!toolCalls || toolCalls.length === 0) {
          if (await this.isRunCancelled(context)) {
            toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();
            await this.handleCancelledStream(context, threadId);
            return;
          }

          const threadEnvelope = extractThreadEnvelope({
            assistantContent: sanitizeAgentOutputText(
              assistantMessage.content || '',
            ),
            prompt: latestUserMessage,
            seedTitle: seedTitle ?? '',
          });
          const normalizedContent = normalizeFinalAssistantContent(
            threadEnvelope.content,
            toolRoundState.toolCalls,
            toolRoundState.uiActions,
          );
          const content = normalizedContent.content;

          toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();

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
            return;
          }

          await this.streamEffects.publishStreamAssistantResponse({
            content,
            context,
            reasoning,
            // When this round already streamed real deltas live, don't
            // re-emit the content as simulated word-split tokens.
            suppressTokenStreaming: roundStreamedTokenCount > 0,
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
            metadata: {
              ...artifactMetadata,
              ...buildAgentScopeMetadata(context),
              ...buildAgentRoutingMetadata({
                defaultModelKey:
                  await this.agentChatModelRegistry.getDefaultModelKey(),
                model,
                prompt: latestUserMessage,
                source,
              }),
              creditsRemaining,
              isFallbackContent: normalizedContent.isFallback,
              memoryEntries: memoryEntriesForResponse,
              memoryInfluence,
              ...buildResolvedModelMetadata(model, Array.from(actualModels)),
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

          await this.streamEffects.publishStreamCompletion({
            completionMetadata: {
              isFallbackContent: normalizedContent.isFallback,
              memoryEntries: memoryEntriesForResponse,
              memoryInfluence,
              ...buildResolvedModelMetadata(model, Array.from(actualModels)),
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
                await this.streamEffects.publishStreamingToolCompleted({
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
                });
                return;
              }

              if (event.kind === 'insufficient_credits') {
                await this.streamEffects.publishStreamingToolCompleted({
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
                });
                return;
              }

              await this.streamEffects.publishStreamingToolCompleted({
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
              });
            },
            onToolStarted: async (event) => {
              await this.streamEffects.publishStreamingToolStarted({
                context,
                parameters: event.parameters,
                startedAt: new Date(event.startTime).toISOString(),
                threadId,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              });
            },
            onUiBlocks: async (event) => {
              if (event.deferPublish) {
                return;
              }
              await this.streamEffects.publishStreamUiBlocks({
                blockIds: event.blockIds,
                blocks: event.blocks as AgentUIBlocksEvent['blocks'],
                context,
                operation: event.operation,
                runId: context.executionId,
                threadId,
              });
            },
          },
          thinkingModel: resolvedPolicy.thinkingModelOverride ?? undefined,
          threadId,
          toolCalls,
        });

        if (toolRoundResult.isCancelled) {
          toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();
          await this.handleCancelledStream(context, threadId);
          return;
        }
        terminalContent = toolRoundResult.terminalContent;
      }

      // Overflowing the round budget still consumed every one of those rounds
      // at the provider — settle them before surfacing the failure, or a turn
      // that runs away is the cheapest turn on the platform.
      await settleAccruedTurnCredits();

      const errorMsg = `Agent exceeded maximum tool-calling rounds (${AGENT_MAX_TOOL_ROUNDS})`;
      await this.streamEffects.publishStreamFailure({
        context,
        error: errorMsg,
        failRun: true,
        persistedError: classifyAgentRunFailure(errorMsg),
        threadId,
      });
    } catch (error: unknown) {
      toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();
      if (await this.isRunCancelled(context)) {
        await this.handleCancelledStream(context, threadId);
        return;
      }

      this.loggerService.error(
        `${this.constructorName} streaming chat failed`,
        {
          error: error instanceof Error ? error.message : error,
          organizationId: context.organizationId,
          userId: context.userId,
        },
      );

      // A queue-owned attempt is not terminal until BullMQ exhausts its retry
      // budget. Propagate the provider/tool failure without recording a
      // run.failed event; the processor owns the one durable terminal outcome.
      if (context.executionMode === 'background') {
        throw error;
      }

      await this.streamEffects.publishStreamFailure({
        context,
        error: readAgentRunPublicError(error),
        failRun: true,
        persistedError: classifyAgentRunFailure(error),
        threadId,
      });
    } finally {
      this.activeStreams.delete(threadId);
    }
  }

  private async isRunCancelled(context: AgentChatContext): Promise<boolean> {
    if (!context.executionId) {
      return false;
    }

    const execution = await this.workflowExecutionsService.findOne(
      scopedWhere(context.organizationId, { id: context.executionId }),
    );
    return execution?.status === WorkflowExecutionStatus.CANCELLED;
  }

  private async handleCancelledStream(
    context: AgentChatContext,
    threadId: string,
  ): Promise<void> {
    await this.streamEffects.publishStreamCancelled(context, threadId);
  }
}
