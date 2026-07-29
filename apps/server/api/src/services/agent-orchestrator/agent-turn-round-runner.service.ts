import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { AGENT_CREDIT_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  type AgentArtifactCompletionMetadata,
  buildAgentArtifactCompletionMetadata as buildArtifactMetadata,
} from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import type {
  OpenRouterMessage,
  OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { ActivitySource } from '@genfeedai/enums';
import {
  type AgentDashboardOperation,
  AgentToolName,
  type AgentToolResult,
  type AgentUIBlock,
  type AgentUiAction,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const RESULT_SUMMARY_MAX_LENGTH = 500;

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
  generationPriority: string;
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
  ) {}

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

    messages.push({
      content: assistantContent,
      role: 'assistant' as const,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      if (strategy.onBeforeTool) {
        const action = await strategy.onBeforeTool();
        if (action === 'cancel') {
          return { isCancelled: true };
        }
      }

      // Sync starts the timer before parse; stream starts after remap (below).
      let startTime = Date.now();
      const requestedToolName = toolCall.function.name as AgentToolName;
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
        } else if (!strategy.deferUnknownToolFailure) {
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
      );
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
          generationPriority,
          organizationId: context.organizationId,
          platform: policy.platform,
          qualityTier: policy.qualityTier,
          reviewModelOverride: policy.reviewModelOverride,
          runId: context.runId,
          strategyId: context.strategyId,
          thinkingModel,
          threadId,
          userId: context.userId,
          validatedScope: policy.scope,
        },
      );

      if (strategy.onAfterTool) {
        const action = await strategy.onAfterTool();
        if (action === 'cancel') {
          return { isCancelled: true };
        }
      }

      const durationMs = Date.now() - startTime;
      state.artifactMetadata.push(buildArtifactMetadata(result.data, context));

      if (result.nextActions?.length) {
        state.uiActions.push(...result.nextActions);
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
        state.totalCreditsUsed += creditCost;
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
      state.toolCalls.push(summary);

      if (
        toolName === AgentToolName.RENDER_DASHBOARD &&
        result.data?.uiBlocks
      ) {
        const normalizedBlocks = this.normalizeUiBlocks(
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
        content: JSON.stringify(result),
        role: 'tool' as const,
        tool_call_id: toolCall.id,
      });
    }

    return { isCancelled: false };
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
}
