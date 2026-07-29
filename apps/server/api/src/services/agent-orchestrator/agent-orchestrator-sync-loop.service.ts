import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { type AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { AgentMessageBusService } from '@api/services/agent-campaign/agent-message-bus.service';
import { AgentCompletionCardBuilderService } from '@api/services/agent-orchestrator/agent-completion-card-builder.service';
import { AgentOrchestratorBatchService } from '@api/services/agent-orchestrator/agent-orchestrator-batch.service';
import { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import {
  type AgentToolRoundState,
  AgentTurnRoundRunnerService,
} from '@api/services/agent-orchestrator/agent-turn-round-runner.service';
import { AGENT_MAX_TOOL_ROUNDS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { getAgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import {
  mergeAgentArtifactCompletionMetadata,
  persistRunArtifacts,
} from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';
import {
  buildResolvedModelMetadata,
  normalizeResponseModel,
} from '@api/services/agent-orchestrator/utils/agent-response-model.util';
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
} from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import { settleAgentTurnCredits } from '@api/services/agent-orchestrator/utils/agent-turn-credit.util';
import { sanitizeAgentOutputText } from '@api/services/agent-orchestrator/utils/sanitize-agent-output.util';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import { AgentMessageRole, AgentType } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class AgentOrchestratorSyncLoopService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly llmDispatcher: LlmDispatcherService,
    private readonly agentThreadsService: AgentThreadsService,
    private readonly agentMessagesService: AgentMessagesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly turnRoundRunner: AgentTurnRoundRunnerService,
    private readonly batchService: AgentOrchestratorBatchService,
    private readonly contextService: AgentOrchestratorContextService,
    private readonly completionCardBuilder: AgentCompletionCardBuilderService,
    private readonly threadEventRecorder: AgentThreadEventRecorderService,
    private readonly agentRunsService: AgentRunsService,
    @Optional()
    private readonly agentMessageBusService?: AgentMessageBusService,
    @Optional()
    private readonly agentCampaignsService?: AgentCampaignsService,
    @Optional()
    private readonly skillRuntimeService?: SkillRuntimeService,
  ) {}

  async executeSynchronousChatLoop(params: {
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
      const tools = buildToolDefinitions(
        mergeAllowedTools(
          syncBaseTools,
          this.batchService.isBatchGenerationIntent(request.content)
            ? BATCH_SCOPED_ALLOWED_TOOLS
            : undefined,
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
          buildAgentChatCompletionParams({
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

          toolRoundState.totalCreditsUsed += await settleAgentTurnCredits({
            creditsUtilsService: this.creditsUtilsService,
            model,
            organizationId: context.organizationId,
            toolCalls: toolRoundState.toolCalls,
            turnCost,
            userId: context.userId,
          });

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

  private async recordAgentResponseModel(params: {
    actualModels?: string[];
    context: AgentChatContext;
    requestedModel: string;
    responseModel?: string;
    runId?: string;
    source?: AgentChatRequest['source'];
    threadId: string;
  }): Promise<string> {
    const actualModel = normalizeResponseModel(
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
        buildResolvedModelMetadata(params.requestedModel, [
          ...(params.actualModels ?? []),
          actualModel,
        ]),
      );
    }

    return actualModel;
  }
}
