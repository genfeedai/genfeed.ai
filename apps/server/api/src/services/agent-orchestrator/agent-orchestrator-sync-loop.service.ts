import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
import { AgentAutoModelResolverService } from '@api/services/agent-orchestrator/agent-auto-model-resolver.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import {
  type AgentToolRoundState,
  AgentTurnRoundRunnerService,
  assertAgentCreditBudget,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import { AGENT_MAX_TOOL_ROUNDS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { mergeAgentArtifactCompletionMetadata } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { resolveAgentAutoRoutingRound } from '@api/services/agent-orchestrator/utils/agent-auto-routing-round.util';
import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';
import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import { buildPersistedAgentResponseMetadata } from '@api/services/agent-orchestrator/utils/agent-persisted-response-metadata.util';
import { buildResolvedModelMetadata } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import { buildAgentRoutingMetadata } from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
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
import { AgentMessageRole, type RouterPriority } from '@genfeedai/contracts';
import type { AgentAutoRoutingResolution } from '@genfeedai/contracts/interfaces';

import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class AgentOrchestratorSyncLoopService {
  constructor(
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly turnRoundRunner: AgentTurnRoundRunnerService,
    private readonly batchService: AgentOrchestratorBatchService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly autoModelResolver: AgentAutoModelResolverService,
    @Optional()
    private readonly agentMessageBusService?: AgentMessageBusService,
    @Optional()
    private readonly agentCampaignsService?: AgentCampaignsService,
    @Optional()
    private readonly skillRuntimeService?: SkillRuntimeService,
  ) {}

  private async reserveSyncChatRound(input: {
    context: AgentChatContext;
    defaultModelKey: string;
    dispatchedModel: string;
    generationPriority: RouterPriority;
    latestAutoRouting: AgentAutoRoutingResolution | undefined;
    latestProviderUsage: OpenRouterChatCompletionResponse['usage'];
    maximumRoundCredits: number;
    messages: Parameters<typeof buildAgentChatCompletionParams>[0]['messages'];
    model: string;
    round: number;
    seedTitle: string;
    source: AgentChatRequest['source'];
    terminalContent: string | undefined;
    threadId: string;
    tools: Parameters<typeof buildAgentChatCompletionParams>[0]['tools'];
    turnCost: number;
    userContent: string;
  }): Promise<{
    credits: number;
    response: OpenRouterChatCompletionResponse;
  }> {
    if (input.terminalContent) {
      return {
        credits: 0,
        response: {
          choices: [
            {
              finish_reason: 'stop',
              message: { content: input.terminalContent, role: 'assistant' },
            },
          ],
          id: `terminal-tool-${input.context.executionId ?? input.threadId}`,
          usage: input.latestProviderUsage,
        },
      };
    }
    return runReservedAgentLlmRound({
      actorUserId: input.context.userId,
      credits: this.creditsUtilsService,
      estimatedCredits: (models) =>
        this.agentChatModelRegistry.getSettledRoundCredits(models),
      idempotencyKey: `${input.context.executionId ?? input.threadId}:agent-llm-round:${input.round}`,
      maximumCredits: input.maximumRoundCredits,
      organizationId: input.context.organizationId,
      requestedModel: input.dispatchedModel,
      run: async () =>
        this.llmDispatcher.chatCompletion(
          buildAgentChatCompletionParams({
            autoAllowedModelKeys:
              await this.agentChatModelRegistry.getAutoAllowedModelKeys(),
            defaultModelKey: input.defaultModelKey,
            dispatchModelKey: input.latestAutoRouting?.dispatchModelKey,
            isWebSearchNeeded: input.latestAutoRouting?.isWebSearchNeeded,
            messages: input.messages,
            model: input.model,
            prompt: input.userContent,
            prioritize: input.generationPriority,
            seedTitle: input.seedTitle,
            sessionId: input.threadId,
            source: input.source,
            tools: input.tools,
          }),
          input.context.organizationId,
          {
            brandId: input.context.scope?.brandId,
            runId: input.context.executionId,
            threadId: input.threadId,
            userId: input.context.userId,
          },
        ),
      waived: input.turnCost === 0,
    });
  }

  async executeSynchronousChatLoop(params: {
    context: AgentChatContext;
    threadId: string;
    generationPriority: RouterPriority;
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
    const actualModels = new Set<string>();
    let roundCredits = 0;

    const settleAccruedTurnCredits = async (): Promise<number> => {
      const creditsToSettle = roundCredits;
      // A settlement failure must not make the outer catch retry a possibly
      // committed ledger write. Every settlement path is terminal.
      roundCredits = 0;

      return creditsToSettle;
    };

    await this.threadEventRecorder.recordThreadTurnStarted({
      context,
      model,
      runId: context.executionId,
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
            ) as CuratedActionName[] | undefined)
          : typeConfig?.defaultTools;
      const tools = buildToolDefinitions(
        mergeAllowedTools(
          syncBaseTools,
          request.source !== 'proactive' &&
            this.batchService.isBatchGenerationIntent(request.content)
            ? BATCH_SCOPED_ALLOWED_TOOLS
            : undefined,
        ),
        resolveBlockedTools({ source: request.source }),
      );
      const allowedToolNames = new Set(
        tools.map((tool) => tool.function.name as CuratedActionName),
      );
      const messages = [...history];
      let round = 0;
      // Auto-routing decision inputs (#4865): the tier depends on how the turn
      // has behaved so far, not only on the opening message.
      let hasPreviousRoundUsedTools = false;
      let latestAutoRouting: AgentAutoRoutingResolution | undefined;
      let terminalContent: string | undefined;
      let latestProviderUsage = {
        completion_tokens: 0,
        prompt_tokens: 0,
        total_tokens: 0,
      };
      // Credits accrue per completed round, not per turn: a turn that burns
      // N tool rounds costs N rounds of inference and has to bill like it.

      while (round < AGENT_MAX_TOOL_ROUNDS || terminalContent) {
        round++;

        const isTerminalCompletion = Boolean(terminalContent);
        const maximumRoundCredits =
          terminalContent || turnCost === 0
            ? 0
            : await this.agentChatModelRegistry.getMaximumRoundCredits(model);
        if (!terminalContent)
          assertAgentCreditBudget(
            context,
            toolRoundState.totalCreditsUsed + roundCredits,
            maximumRoundCredits,
          );
        const { defaultModelKey, dispatchedModel, resolution } =
          await resolveAgentAutoRoutingRound({
            context,
            hasPreviousRoundUsedTools,
            hasToolsAvailable: tools.length > 0,
            isTerminalRound: isTerminalCompletion,
            latestUserMessage: request.content,
            model,
            modelRegistry: this.agentChatModelRegistry,
            previous: latestAutoRouting,
            prioritize: generationPriority,
            resolver: this.autoModelResolver,
            roundNumber: round,
            source: request.source,
            threadId,
          });
        latestAutoRouting = resolution;
        const reservedRound = await this.reserveSyncChatRound({
          context,
          defaultModelKey,
          dispatchedModel,
          generationPriority,
          latestAutoRouting,
          latestProviderUsage,
          maximumRoundCredits,
          messages,
          model,
          round,
          seedTitle,
          source: request.source,
          terminalContent,
          threadId,
          tools,
          turnCost,
          userContent: request.content,
        });
        const response = reservedRound.response;
        terminalContent = undefined;
        if (!isTerminalCompletion) {
          latestProviderUsage = response.usage;
          const actualModel =
            await this.turnRoundRunner.recordAgentResponseModel({
              actualModels: Array.from(actualModels),
              context,
              requestedModel: model,
              responseModel: response.model,
              executionId: context.executionId,
              source: request.source,
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
        hasPreviousRoundUsedTools = Boolean(toolCalls?.length);

        if (!toolCalls || toolCalls.length === 0) {
          const threadEnvelope = extractThreadEnvelope({
            assistantContent: sanitizeAgentOutputText(
              assistantMessage.content || '',
            ),
            prompt: request.content,
            seedTitle,
          });
          const normalizedContent = normalizeFinalAssistantContent(
            threadEnvelope.content,
            toolRoundState.toolCalls,
            toolRoundState.uiActions,
          );
          const content = normalizedContent.content;

          toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();

          await maybeUpdateThreadTitle({
            agentThreadsService: this.agentThreadsService,
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
              autoRouting: latestAutoRouting,
              defaultModelKey,
              model,
              prompt: request.content,
              source: request.source,
            }),
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
          };

          await this.agentMessagesService.addMessage({
            brandId: context.scope?.brandId,
            content,
            metadata: buildPersistedAgentResponseMetadata(
              assistantMetadata,
              creditsRemaining,
              context.executionId,
              response.usage,
            ),
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
            runId: context.executionId,
            threadId,
          });
          await this.threadEventRecorder.recordRunCompleted({
            context,
            detail: 'Agent completed',
            runId: context.executionId,
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

        toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();
        const toolRoundResult = await this.turnRoundRunner.executeToolRound({
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
            onToolCompleted: async (event) => {
              await this.threadEventRecorder.recordToolCompleted({
                context,
                durationMs: event.durationMs,
                error: event.summary.error,
                runId: context.executionId,
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
                runId: context.executionId,
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
                runId: context.executionId,
                threadId,
              });
            },
          },
          thinkingModel: policy.thinkingModelOverride ?? model,
          threadId,
          toolCalls,
        });
        terminalContent = toolRoundResult.terminalContent;
      }

      // Overflowing the round budget still consumed every one of those rounds
      // at the provider — settle them before surfacing the failure, or a turn
      // that runs away is the cheapest turn on the platform.
      await settleAccruedTurnCredits();

      throw new Error(
        `Agent exceeded maximum tool-calling rounds (${AGENT_MAX_TOOL_ROUNDS})`,
      );
    } catch (error: unknown) {
      toolRoundState.totalCreditsUsed += await settleAccruedTurnCredits();
      await this.threadEventRecorder.recordRunFailed({
        context,
        error: error instanceof Error ? error.message : 'Unknown error',
        runId: context.executionId,
        threadId,
      });
      throw error;
    }
  }
}
