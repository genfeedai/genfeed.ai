import { ActivitySource, type RouterPriority } from '@genfeedai/enums';
import {
  type AgentDashboardOperation,
  AgentToolName,
  type AgentToolResult,
  type AgentUIBlock,
  type AgentUiAction,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { AGENT_CREDIT_COSTS } from '@server/services/agent-orchestrator/constants/agent-credit-costs.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
  ToolCallSummary,
} from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@server/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import {
  buildCampaignPreparationCacheKey,
  readCampaignConfirmationSourceActionId,
  readPreparedCampaignTransition,
} from '@server/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { AgentToolExecutorService } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  type AgentArtifactCompletionMetadata,
  buildAgentArtifactCompletionMetadata as buildArtifactMetadata,
} from '@server/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import {
  getGenerationPreparationRedirect,
  inferPrepareGenerationType,
  normalizeRequestedAgentToolName,
} from '@server/services/agent-orchestrator/utils/agent-generation-prepare-redirect.util';
import { normalizeResponseModel } from '@server/services/agent-orchestrator/utils/agent-response-model.util';
import { normalizeUiBlocks } from '@server/services/agent-orchestrator/utils/agent-ui-blocks.util';
import { CacheService } from '@server/services/cache/cache.service';
import type {
  OpenRouterMessage,
  OpenRouterToolCallResponse,
} from '@server/services/integrations/openrouter/dto/openrouter.dto';

const RESULT_SUMMARY_MAX_LENGTH = 500;
const TERMINAL_RESULT_TOOLS = new Set<AgentToolName>([
  AgentToolName.GENERATE_IMAGE,
  AgentToolName.GENERATE_VIDEO,
  AgentToolName.SUGGEST_INGREDIENT_ALTERNATIVES,
]);

function getTerminalToolContent(toolName: AgentToolName): string {
  if (toolName === AgentToolName.SUGGEST_INGREDIENT_ALTERNATIVES) {
    return 'Here are the ingredient alternatives.';
  }
  if (toolName === AgentToolName.GENERATE_VIDEO) {
    return 'Video generation accepted.';
  }
  return 'Image generation accepted.';
}

export type AgentToolRoundRiskLevel = 'low' | 'medium' | 'high';

export type AgentToolRoundUiBlocks = {
  blockIds?: string[];
  blocks?: unknown[];
  operation: AgentDashboardOperation;
} | null;

/**
 * Mutable accumulators shared across tool rounds within a single chat turn.
 * The runner mutates these in place so sync/stream loops keep identical merge
 * semantics without re-implementing accumulation.
 */
export type AgentToolRoundState = {
  artifactMetadata: AgentArtifactCompletionMetadata[];
  highestRiskLevel: AgentToolRoundRiskLevel;
  latestUiBlocks: AgentToolRoundUiBlocks;
  reviewRequired: boolean;
  toolCalls: ToolCallSummary[];
  totalCreditsUsed: number;
  uiActions: AgentUiAction[];
};

export type AgentToolRoundCancelAction = 'cancel' | 'continue';

export type AgentToolRoundStartedEvent = {
  parameters: Record<string, unknown>;
  startTime: number;
  toolCallId: string;
  toolName: AgentToolName;
};

export type AgentToolRoundCompletedEvent = {
  durationMs: number;
  kind: 'executed' | 'insufficient_credits' | 'unknown';
  parameters: Record<string, unknown>;
  requestedToolName: AgentToolName;
  result?: AgentToolResult;
  summary: ToolCallSummary;
  toolCallId: string;
  toolName: string;
};

export type AgentToolRoundUiBlocksEvent = {
  blockIds?: string[];
  blocks: AgentUIBlock[];
  deferPublish?: boolean;
  operation: AgentDashboardOperation;
  resultData: Record<string, unknown>;
};

export type AgentToolRoundStrategy = {
  /**
   * Stream: check cancellation before each tool call. Return `'cancel'` to
   * stop the round (caller handles cancelled-stream lifecycle).
   */
  onBeforeTool?: () => Promise<AgentToolRoundCancelAction>;
  /**
   * Stream: check cancellation after tool execution completes.
   */
  onAfterTool?: () => Promise<AgentToolRoundCancelAction>;
  /**
   * Mode-specific "tool started" emission.
   * Sync → thread event recorder; stream → SSE/work events.
   */
  onToolStarted?: (event: AgentToolRoundStartedEvent) => Promise<void>;
  /**
   * Mode-specific "tool completed" emission (success and failure paths).
   */
  onToolCompleted?: (event: AgentToolRoundCompletedEvent) => Promise<void>;
  /**
   * Mode-specific UI-blocks emission for `render_dashboard`.
   * Sync always records; stream may skip publish when `deferPublish` is set.
   */
  onUiBlocks?: (event: AgentToolRoundUiBlocksEvent) => Promise<void>;
  /**
   * Sync-only today: fire-and-forget run tool-call accounting.
   */
  onRecordRunToolCall?: (summary: ToolCallSummary) => void;
  /**
   * Stream defers the unknown-tool failure until after `onToolStarted` so the
   * client sees a started→failed pair. Sync fails before started.
   */
  deferUnknownToolFailure?: boolean;
  /**
   * Sync logs a warning when tool arguments fail to parse; stream is silent.
   */
  logParseErrors?: boolean;
};

export type ExecuteToolRoundParams = {
  allowedToolNames: Set<AgentToolName>;
  assistantContent: string | null;
  attachmentUrls?: string[];
  context: AgentChatContext;
  generationPriority: RouterPriority;
  messages: OpenRouterMessage[];
  model: string;
  policy: ResolvedAgentExecutionPolicy;
  source?: AgentChatRequest['source'];
  state: AgentToolRoundState;
  strategy?: AgentToolRoundStrategy;
  thinkingModel?: string;
  threadId: string;
  toolCalls: OpenRouterToolCallResponse[];
};

export type ExecuteToolRoundResult = {
  isCancelled: boolean;
  terminalContent?: string;
  terminalToolName?: AgentToolName;
};

type ConfirmedCampaignIntent = {
  campaignId: string;
  sourceActionId: string;
};

function summarizeToolResult(result: {
  data?: Record<string, unknown>;
  error?: string;
  success: boolean;
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

/**
 * Shared per-tool-call batch processor for sync and stream agent loops.
 *
 * Owns: assistant tool_calls message push, tool name validation/recovery/remap,
 * credit preflight/deduction, tool execution, result message accumulation, risk
 * /UI-action/artifact aggregation.
 *
 * Mode-specific emission (thread events vs SSE) and cancellation live in the
 * optional strategy callbacks — see `AgentToolRoundStrategy`.
 */
@Injectable()
export class AgentTurnRoundRunnerService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Resolve the model that actually served a turn, log it, and merge into run
   * metadata. Shared by sync and stream loops so both stay byte-identical.
   */
  async recordAgentResponseModel(params: {
    actualModels?: string[];
    context: AgentChatContext;
    requestedModel: string;
    responseModel?: string;
    executionId?: string;
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
      executionId: params.executionId,
      source: params.source ?? 'agent',
      threadId: params.threadId,
      userId: params.context.userId,
    });

    return actualModel;
  }

  async executeToolRound(
    params: ExecuteToolRoundParams,
  ): Promise<ExecuteToolRoundResult> {
    const {
      allowedToolNames,
      assistantContent,
      attachmentUrls,
      context,
      generationPriority,
      messages,
      model,
      policy,
      source,
      state,
      strategy = {},
      thinkingModel,
      threadId,
      toolCalls,
    } = params;
    const currentOperatorMessage = this.readCurrentOperatorMessage(
      messages,
      source,
    );

    messages.push({
      content: assistantContent,
      role: 'assistant' as const,
      tool_calls: toolCalls,
    });
    let terminalToolName: AgentToolName | undefined;

    for (const toolCall of toolCalls) {
      if (strategy.onBeforeTool) {
        const action = await strategy.onBeforeTool();
        if (action === 'cancel') {
          return { isCancelled: true };
        }
      }

      // Sync starts the timer before parse; stream starts after remap (below).
      let startTime = Date.now();
      const rawRequestedToolName = toolCall.function.name;
      const requestedToolName = normalizeRequestedAgentToolName(
        rawRequestedToolName,
      ) as AgentToolName;
      let toolParams: Record<string, unknown> = {};

      try {
        toolParams = JSON.parse(toolCall.function.arguments);
      } catch {
        if (strategy.logParseErrors) {
          this.loggerService.warn(
            `Failed to parse tool arguments for ${requestedToolName}`,
            this.constructorName,
          );
        }
      }

      let toolName = requestedToolName;

      if (!allowedToolNames.has(requestedToolName)) {
        const recoveredToolName = this.getGenerationPreparationRedirect(
          rawRequestedToolName,
          allowedToolNames,
          context.generationMode,
          toolParams.generationType,
        );

        if (recoveredToolName) {
          allowedToolNames.add(recoveredToolName);
          toolName = recoveredToolName;
          toolParams = this.buildUnknownToolRecoveryParams(
            rawRequestedToolName,
            toolParams,
          );

          this.loggerService.warn(
            `Recovered unknown tool ${rawRequestedToolName} -> ${recoveredToolName}`,
            {
              constructor: this.constructorName,
              model,
              organizationId: context.organizationId,
              source: source ?? 'agent',
              threadId,
              toolName: rawRequestedToolName,
              userId: context.userId,
            },
          );
        } else if (!strategy.deferUnknownToolFailure) {
          const unknownToolError = this.buildUnknownToolError(
            rawRequestedToolName,
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
            source: source ?? 'agent',
            threadId,
            toolName: requestedToolName,
            userId: context.userId,
          });

          state.toolCalls.push(summary);

          if (strategy.onToolCompleted) {
            await strategy.onToolCompleted({
              durationMs,
              kind: 'unknown',
              parameters: toolParams,
              requestedToolName,
              summary,
              toolCallId: toolCall.id,
              toolName: requestedToolName,
            });
          }

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
      const directGenerationOverride = this.getGenerationPreparationRedirect(
        toolName,
        allowedToolNames,
        context.generationMode,
        toolParams.generationType,
      );
      if (directGenerationOverride) {
        allowedToolNames.add(directGenerationOverride);
        const originalToolName = toolName;
        toolName = directGenerationOverride;
        toolParams = this.buildUnknownToolRecoveryParams(
          rawRequestedToolName,
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

      // Stream resets startTime after remap so duration excludes remap work.
      if (strategy.deferUnknownToolFailure) {
        startTime = Date.now();
      }

      if (strategy.onToolStarted) {
        await strategy.onToolStarted({
          parameters: toolParams,
          startTime,
          toolCallId: toolCall.id,
          toolName,
        });
      }

      // Stream: unknown tools that could not be recovered fail after started.
      if (strategy.deferUnknownToolFailure && !allowedToolNames.has(toolName)) {
        const unknownToolError = this.buildUnknownToolError(
          rawRequestedToolName,
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
        state.toolCalls.push(summary);

        if (strategy.onToolCompleted) {
          await strategy.onToolCompleted({
            durationMs,
            kind: 'unknown',
            parameters: toolParams,
            requestedToolName,
            summary,
            toolCallId: toolCall.id,
            toolName: requestedToolName,
          });
        }

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

          state.toolCalls.push(summary);

          if (strategy.onToolCompleted) {
            await strategy.onToolCompleted({
              durationMs,
              kind: 'insufficient_credits',
              parameters: toolParams,
              requestedToolName,
              summary,
              toolCallId: toolCall.id,
              toolName,
            });
          }

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

      const confirmedCampaignIntent = await this.resolveConfirmedCampaignIntent(
        toolName,
        currentOperatorMessage,
        context.organizationId,
        threadId,
      );
      if (this.isCampaignConfirmationTool(toolName)) {
        if (confirmedCampaignIntent) {
          toolParams = {
            campaignId: confirmedCampaignIntent.campaignId,
            confirmed: true,
            sourceActionId: confirmedCampaignIntent.sourceActionId,
          };
        } else {
          const claimedConfirmation =
            toolParams.confirmed === true ||
            toolParams.sourceActionId !== undefined;
          if (claimedConfirmation) {
            this.loggerService.warn(
              'Rejected untrusted campaign confirmation proof',
              {
                campaignId: toolParams.campaignId,
                organizationId: context.organizationId,
                threadId,
                toolName,
                userId: context.userId,
              },
            );
          }
          const {
            confirmed: _untrustedConfirmed,
            sourceActionId: _untrustedSourceActionId,
            ...unconfirmedParams
          } = toolParams;
          toolParams = unconfirmedParams;
        }
      }

      const result = await this.toolExecutorService.executeTool(
        toolName,
        toolParams,
        {
          apiKeyContext: context.apiKeyContext,
          attachmentUrls,
          authToken: context.authToken,
          autonomyMode: policy.autonomyMode,
          brandId: policy.brandId,
          creditGovernance: policy.creditGovernance,
          generationModelOverride: policy.generationModelOverride,
          generationMode: context.generationMode,
          generationPriority,
          generationSettings: context.generationSettings,
          organizationId: context.organizationId,
          platform: policy.platform,
          qualityTier: policy.qualityTier,
          reviewModelOverride: policy.reviewModelOverride,
          runId: context.executionId,
          ...(confirmedCampaignIntent
            ? {
                confirmationOrigin: 'thread-ui-action' as const,
                sourceActionId: confirmedCampaignIntent.sourceActionId,
              }
            : {}),
          strategyId: context.strategyId,
          thinkingModel,
          threadId,
          userId: context.userId,
          validatedScope: policy.scope,
        },
      );
      const modelVisibleResult = this.buildModelVisibleToolResult(
        toolName,
        result,
      );

      const durationMs = Date.now() - startTime;
      state.artifactMetadata.push(buildArtifactMetadata(result.data, context));

      if (result.nextActions?.length) {
        state.uiActions.push(...result.nextActions);
      }
      if (
        result.success &&
        result.nextActions?.length &&
        TERMINAL_RESULT_TOOLS.has(toolName)
      ) {
        terminalToolName = toolName;
      }

      if (result.requiresConfirmation) {
        state.reviewRequired = true;
      }
      if (result.riskLevel === 'high') {
        state.highestRiskLevel = 'high';
      } else if (
        result.riskLevel === 'medium' &&
        state.highestRiskLevel === 'low'
      ) {
        state.highestRiskLevel = 'medium';
      }

      // Generation tools may bill themselves (dynamic amount). Do not also
      // deduct the catalog creditCost. Still record result.creditsUsed so the
      // turn total and UI reflect real spend.
      // Bill + record the summary *before* onAfterTool cancel: the tool already
      // ran (side effects done). Cancelled streams must still charge
      // orchestrator-billed tools and leave an audit trail.
      const isOrchestratorBilled =
        result.success && creditCost > 0 && !result.isBillingDelegated;
      const delegatedCredits =
        result.success && result.isBillingDelegated
          ? Math.max(0, Math.round(result.creditsUsed ?? 0))
          : 0;

      if (isOrchestratorBilled) {
        await this.creditsUtilsService.deductCreditsFromOrganization(
          context.organizationId,
          context.userId,
          creditCost,
          `Agent tool: ${toolName}`,
          ActivitySource.SCRIPT,
        );
        state.totalCreditsUsed += creditCost;
      } else if (delegatedCredits > 0) {
        state.totalCreditsUsed += delegatedCredits;
      }

      const summary: ToolCallSummary = {
        creditsUsed: isOrchestratorBilled ? creditCost : delegatedCredits,
        durationMs,
        error: result.error,
        parameters: toolParams,
        resultSummary: summarizeToolResult(modelVisibleResult),
        status: result.success ? 'completed' : 'failed',
        toolName,
      };
      state.toolCalls.push(summary);

      if (strategy.onAfterTool) {
        const action = await strategy.onAfterTool();
        if (action === 'cancel') {
          return { isCancelled: true };
        }
      }

      if (
        toolName === AgentToolName.RENDER_DASHBOARD &&
        result.data?.uiBlocks
      ) {
        const normalizedBlocks = normalizeUiBlocks(
          result.data.uiBlocks as unknown[],
        );
        state.latestUiBlocks = {
          blockIds: result.data.blockIds as string[] | undefined,
          blocks: normalizedBlocks,
          operation: result.data.operation as AgentDashboardOperation,
        };

        if (strategy.onUiBlocks) {
          await strategy.onUiBlocks({
            blockIds: result.data.blockIds as string[] | undefined,
            blocks: normalizedBlocks,
            deferPublish: Boolean(result.data.deferUiBlocksPublish),
            operation: result.data.operation as AgentDashboardOperation,
            resultData: result.data,
          });
        }
      }

      if (strategy.onRecordRunToolCall) {
        strategy.onRecordRunToolCall(summary);
      }

      if (strategy.onToolCompleted) {
        await strategy.onToolCompleted({
          durationMs,
          kind: 'executed',
          parameters: toolParams,
          requestedToolName,
          result,
          summary,
          toolCallId: toolCall.id,
          toolName,
        });
      }

      messages.push({
        content: JSON.stringify(modelVisibleResult),
        role: 'tool' as const,
        tool_call_id: toolCall.id,
      });
    }

    return {
      isCancelled: false,
      ...(terminalToolName
        ? {
            terminalContent: getTerminalToolContent(terminalToolName),
            terminalToolName,
          }
        : {}),
    };
  }

  private isCampaignConfirmationTool(toolName: AgentToolName): boolean {
    return (
      toolName === AgentToolName.START_CAMPAIGN ||
      toolName === AgentToolName.PAUSE_CAMPAIGN
    );
  }

  private async resolveConfirmedCampaignIntent(
    toolName: AgentToolName,
    currentOperatorMessage: string | null,
    organizationId: string,
    threadId: string,
  ): Promise<ConfirmedCampaignIntent | null> {
    const transition =
      toolName === AgentToolName.START_CAMPAIGN
        ? 'start'
        : toolName === AgentToolName.PAUSE_CAMPAIGN
          ? 'pause'
          : null;
    if (!transition) {
      return null;
    }

    if (!currentOperatorMessage) {
      return null;
    }
    const confirmationPrompt = currentOperatorMessage;

    const sourceActionId =
      readCampaignConfirmationSourceActionId(confirmationPrompt);
    if (!sourceActionId) {
      return null;
    }

    const preparation = readPreparedCampaignTransition(
      await this.cacheService.get<unknown>(
        buildCampaignPreparationCacheKey({
          organizationId,
          sourceActionId,
          threadId,
        }),
      ),
    );
    if (
      preparation?.transition !== transition ||
      preparation.sourceActionId !== sourceActionId ||
      preparation.confirmationPrompt !== confirmationPrompt
    ) {
      return null;
    }

    return {
      campaignId: preparation.campaignId,
      sourceActionId,
    };
  }

  private readCurrentOperatorMessage(
    messages: OpenRouterMessage[],
    source: AgentChatRequest['source'] | undefined,
  ): string | null {
    if ((source ?? 'agent') !== 'agent') {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'user' && typeof message.content === 'string') {
        return message.content;
      }
    }

    return null;
  }

  private buildModelVisibleToolResult(
    toolName: AgentToolName,
    result: AgentToolResult,
  ): AgentToolResult {
    if (
      !this.isCampaignConfirmationTool(toolName) ||
      result.requiresConfirmation !== true
    ) {
      return result;
    }

    const safeData = Object.fromEntries(
      Object.entries(result.data ?? {}).filter(
        ([key]) => key !== 'confirmationPrompt' && key !== 'sourceActionId',
      ),
    );
    const { nextActions: _nextActions, ...safeResult } = result;
    return {
      ...safeResult,
      data: safeData,
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
    toolName: string,
    allowedTools: Set<AgentToolName>,
    generationMode?: AgentChatContext['generationMode'],
    requestedGenerationType?: unknown,
  ): AgentToolName | null {
    return getGenerationPreparationRedirect(toolName, allowedTools, {
      generationMode,
      requestedGenerationType,
    });
  }

  private buildUnknownToolRecoveryParams(
    requestedToolName: string,
    toolParams: Record<string, unknown>,
  ): Record<string, unknown> {
    const generationType = inferPrepareGenerationType(requestedToolName);
    if (!generationType) {
      return toolParams;
    }

    const prompt =
      (toolParams.prompt as string | undefined) ||
      (toolParams.description as string | undefined) ||
      (toolParams.text as string | undefined) ||
      '';

    return {
      ...toolParams,
      generationType,
      prompt,
    };
  }
}
