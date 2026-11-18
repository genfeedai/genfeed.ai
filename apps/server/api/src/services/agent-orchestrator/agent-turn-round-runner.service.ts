import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { AgentKnowledgeCitationService } from '@api/services/agent-orchestrator/agent-knowledge-citation.service';
import { AgentUntrustedContentGateService } from '@api/services/agent-orchestrator/agent-untrusted-content-gate.service';
import { agentToolCreditFloor } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import type {
  AgentChatContext,
  AgentChatRequest,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type {
  AgentToolRoundRiskLevel,
  AgentToolRoundState,
  AgentToolRoundStrategy,
  ExecuteToolRoundParams,
  ExecuteToolRoundResult,
} from '@api/services/agent-orchestrator/interfaces/agent-turn-round-runner.interface';
import { AgentToolConfirmationService } from '@api/services/agent-orchestrator/tools/agent-tool-confirmation.service';
import {
  AgentToolExecutorService,
  type ToolExecutionContext,
} from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { buildAgentArtifactCompletionMetadata as buildArtifactMetadata } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import { recordDashboardBlocks } from '@api/services/agent-orchestrator/utils/agent-dashboard-blocks.util';
import { hasGenerationHoldIntent } from '@api/services/agent-orchestrator/utils/agent-generation-hold-intent.util';
import {
  type GenerationRedirect,
  getGenerationPreparationRedirect,
  normalizeRequestedAgentToolName,
} from '@api/services/agent-orchestrator/utils/agent-generation-prepare-redirect.util';
import {
  annotateKnowledgeSearchData,
  readBrandId,
} from '@api/services/agent-orchestrator/utils/agent-knowledge-citation.util';
import { readLatestOperatorMessage } from '@api/services/agent-orchestrator/utils/agent-operator-message.util';
import { normalizeResponseModel } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import {
  APPROVAL_PENDING_RESULT_SUMMARY,
  isApprovalPendingResult,
  resolveTerminalToolOutcome,
  type TerminalToolOutcome,
} from '@api/services/agent-orchestrator/utils/agent-terminal-tool-result.util';
import { raceToolExecution } from '@api/services/agent-orchestrator/utils/agent-tool-race.util';
import { buildToolResultSummary } from '@api/services/agent-orchestrator/utils/agent-tool-result-summary.util';
import { buildUnknownToolRecoveryParams } from '@api/services/agent-orchestrator/utils/agent-unknown-tool-recovery.util';
import type {
  OpenRouterMessage,
  OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { CuratedActionName } from '@genfeedai/actions';
import { ActivitySource } from '@genfeedai/contracts';
import { type AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, Optional } from '@nestjs/common';

// Every agent tool is itself a nested workflow run. Without a ceiling, one
// stalled nested run holds the whole turn (and its Stop button) forever, because
// cancellation was only observed between tools.
const TOOL_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
const TOOL_CANCEL_POLL_INTERVAL_MS = 1500;

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
export function assertAgentCreditBudget(
  context: Pick<AgentChatContext, 'creditBudget'>,
  consumed: number,
  estimate: number,
): void {
  if (context.creditBudget === undefined) return;
  if (
    !Number.isFinite(context.creditBudget) ||
    context.creditBudget <= 0 ||
    !Number.isFinite(estimate) ||
    estimate < 0 ||
    !Number.isFinite(consumed) ||
    consumed < 0 ||
    consumed + estimate > context.creditBudget
  ) {
    throw new Error(
      'Agent credit budget exhausted or paid-operation quote unavailable',
    );
  }
}

type ParsedToolCall = {
  rawRequestedToolName: string;
  requestedToolName: CuratedActionName;
  toolParams: Record<string, unknown>;
};

type RemappedToolCall = {
  preRemapToolName: CuratedActionName;
  toolName: CuratedActionName;
  toolParams: Record<string, unknown>;
};

type ToolInvocation = {
  creditCost: number;
  preflightCreditCost: number;
  requestedToolName: CuratedActionName;
  startTime: number;
  toolName: CuratedActionName;
  toolParams: Record<string, unknown>;
};

type ToolCallOutcome =
  | { kind: 'skipped' }
  | { kind: 'cancelled'; result: ExecuteToolRoundResult }
  | { kind: 'completed'; terminal: TerminalToolOutcome | undefined };

@Traced()
@Injectable()
export class AgentTurnRoundRunnerService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly toolExecutorService: AgentToolExecutorService,
    private readonly toolConfirmationService: AgentToolConfirmationService,
    private readonly untrustedContentGateService: AgentUntrustedContentGateService,
    @Optional()
    private readonly citationService?: AgentKnowledgeCitationService,
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

  private async recordUnaffordableTool(input: {
    context: AgentChatContext;
    messages: ExecuteToolRoundParams['messages'];
    preflightCreditCost: number;
    requestedToolName: CuratedActionName;
    startTime: number;
    state: AgentToolRoundState;
    strategy: AgentToolRoundStrategy;
    toolCallId: string;
    toolName: string;
    toolParams: Record<string, unknown>;
  }): Promise<boolean> {
    if (input.preflightCreditCost <= 0) return false;
    const canAfford =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        input.context.organizationId,
        input.preflightCreditCost,
      );
    if (canAfford) return false;
    const durationMs = Date.now() - input.startTime;
    const error = `Insufficient credits (need ${input.preflightCreditCost})`;
    const summary: ToolCallSummary = {
      creditsUsed: 0,
      durationMs,
      error,
      status: 'failed',
      toolName: input.toolName,
    };
    input.state.toolCalls.push(summary);
    if (input.strategy.onToolCompleted) {
      await input.strategy.onToolCompleted({
        durationMs,
        kind: 'insufficient_credits',
        parameters: input.toolParams,
        requestedToolName: input.requestedToolName,
        summary,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
      });
    }
    input.messages.push({
      content: JSON.stringify({
        error: `Insufficient credits. This tool requires ${input.preflightCreditCost} credits.`,
        success: false,
      }),
      role: 'tool' as const,
      tool_call_id: input.toolCallId,
    });
    return true;
  }

  private async recordUnknownToolFailure(input: {
    allowedToolNames: Set<CuratedActionName>;
    context: AgentChatContext;
    messages: ExecuteToolRoundParams['messages'];
    model: string;
    rawRequestedToolName: string;
    requestedToolName: CuratedActionName;
    source: AgentChatRequest['source'];
    startTime: number;
    state: AgentToolRoundState;
    strategy: AgentToolRoundStrategy;
    threadId: string;
    toolCallId: string;
    toolParams: Record<string, unknown>;
  }): Promise<void> {
    const unknownToolError = this.buildUnknownToolError(
      input.rawRequestedToolName,
      input.allowedToolNames,
    );
    const durationMs = Date.now() - input.startTime;
    const summary: ToolCallSummary = {
      creditsUsed: 0,
      durationMs,
      error: unknownToolError,
      status: 'failed',
      toolName: input.requestedToolName,
    };

    this.loggerService.warn(unknownToolError, {
      allowedToolsCount: input.allowedToolNames.size,
      constructor: this.constructorName,
      model: input.model,
      organizationId: input.context.organizationId,
      source: input.source ?? 'agent',
      threadId: input.threadId,
      toolName: input.requestedToolName,
      userId: input.context.userId,
    });

    input.state.toolCalls.push(summary);

    if (input.strategy.onToolCompleted) {
      await input.strategy.onToolCompleted({
        durationMs,
        kind: 'unknown',
        parameters: input.toolParams,
        requestedToolName: input.requestedToolName,
        summary,
        toolCallId: input.toolCallId,
        toolName: input.requestedToolName,
      });
    }

    input.messages.push({
      content: JSON.stringify({
        availableTools: Array.from(input.allowedToolNames),
        error: unknownToolError,
        success: false,
      }),
      role: 'tool' as const,
      tool_call_id: input.toolCallId,
    });
  }

  async executeToolRound(
    params: ExecuteToolRoundParams,
  ): Promise<ExecuteToolRoundResult> {
    const { assistantContent, messages, source, toolCalls } = params;
    const currentOperatorMessage = this.readCurrentOperatorMessage(
      messages,
      source,
    );

    messages.push({
      content: assistantContent,
      role: 'assistant' as const,
      tool_calls: toolCalls,
    });
    let terminal: TerminalToolOutcome | undefined;

    for (const toolCall of toolCalls) {
      const outcome = await this.runToolCall(
        params,
        toolCall,
        currentOperatorMessage,
      );
      if (outcome.kind === 'cancelled') {
        return outcome.result;
      }
      if (outcome.kind === 'completed' && outcome.terminal) {
        terminal = outcome.terminal;
      }
    }

    return {
      isCancelled: false,
      ...(terminal
        ? {
            terminalContent: terminal.content,
            terminalToolName: terminal.toolName,
          }
        : {}),
    };
  }

  private async runToolCall(
    params: ExecuteToolRoundParams,
    toolCall: OpenRouterToolCallResponse,
    currentOperatorMessage: string | null,
  ): Promise<ToolCallOutcome> {
    const { context, messages, state, strategy = {}, threadId } = params;
    if (strategy.onBeforeTool) {
      const action = await strategy.onBeforeTool();
      if (action === 'cancel') {
        return { kind: 'cancelled', result: { isCancelled: true } };
      }
    }

    const invocation = await this.resolveToolInvocation(params, toolCall);
    if (!invocation) {
      return { kind: 'skipped' };
    }
    const { preflightCreditCost, requestedToolName, startTime, toolName } =
      invocation;

    assertAgentCreditBudget(
      context,
      state.totalCreditsUsed,
      preflightCreditCost,
    );

    if (
      await this.recordUnaffordableTool({
        context,
        messages,
        preflightCreditCost,
        requestedToolName,
        startTime,
        state,
        strategy,
        toolCallId: toolCall.id,
        toolName,
        toolParams: invocation.toolParams,
      })
    ) {
      return { kind: 'skipped' };
    }

    const preparedToolCall = await this.toolConfirmationService.prepareToolCall(
      {
        currentOperatorMessage,
        organizationId: context.organizationId,
        parameters: invocation.toolParams,
        threadId,
        toolName,
        userId: context.userId,
      },
    );

    const result = await this.executeToolUntilSettled(
      params,
      toolName,
      preparedToolCall,
    );
    if (!result) {
      return {
        kind: 'cancelled',
        result: { isCancelled: true, wasInterrupted: true },
      };
    }

    return this.recordExecutedToolCall(params, toolCall, {
      invocation: { ...invocation, toolParams: preparedToolCall.parameters },
      result,
    });
  }

  /**
   * Parses the call, recovers or remaps an unknown or direct generation tool,
   * and prices it. Resolves to null when the call was recorded as an unknown
   * tool failure and must be skipped.
   */
  private async resolveToolInvocation(
    params: ExecuteToolRoundParams,
    toolCall: OpenRouterToolCallResponse,
  ): Promise<ToolInvocation | null> {
    const {
      allowedToolNames,
      context,
      messages,
      model,
      source,
      state,
      strategy = {},
      threadId,
    } = params;

    // Sync starts the timer before parse; stream starts after remap (below).
    let startTime = Date.now();
    const parsed = this.parseToolCall(toolCall, strategy);
    const { rawRequestedToolName, requestedToolName } = parsed;
    const recordUnknownToolFailure = () =>
      this.recordUnknownToolFailure({
        allowedToolNames,
        context,
        messages,
        model,
        rawRequestedToolName,
        requestedToolName,
        source,
        startTime,
        state,
        strategy,
        threadId,
        toolCallId: toolCall.id,
        toolParams: parsed.toolParams,
      });

    const remapped = this.remapToolCall(params, parsed);
    if (!remapped) {
      // Not recoverable and not deferred: fail before the started event.
      await recordUnknownToolFailure();
      return null;
    }
    const { preRemapToolName, toolName, toolParams } = remapped;

    const creditCost = agentToolCreditFloor(toolName, toolParams);
    // Gate affordability on the tool the model asked for: the
    // prepare_generation remap above would otherwise resolve a zero
    // cost and skip the check entirely (#482).
    const preflightCreditCost = Math.max(
      creditCost,
      agentToolCreditFloor(preRemapToolName, toolParams),
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
      await this.recordUnknownToolFailure({
        allowedToolNames,
        context,
        messages,
        model,
        rawRequestedToolName,
        requestedToolName,
        source,
        startTime,
        state,
        strategy,
        threadId,
        toolCallId: toolCall.id,
        toolParams,
      });
      return null;
    }

    return {
      creditCost,
      preflightCreditCost,
      requestedToolName,
      startTime,
      toolName,
      toolParams,
    };
  }

  private parseToolCall(
    toolCall: OpenRouterToolCallResponse,
    strategy: AgentToolRoundStrategy,
  ): ParsedToolCall {
    const rawRequestedToolName = toolCall.function.name;
    const requestedToolName = normalizeRequestedAgentToolName(
      rawRequestedToolName,
    ) as CuratedActionName;
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

    return { rawRequestedToolName, requestedToolName, toolParams };
  }

  /**
   * Recovers an unknown tool and remaps a direct generation tool. Resolves to
   * null when the tool is unknown, unrecoverable, and the strategy fails
   * unknown tools immediately.
   */
  private remapToolCall(
    params: ExecuteToolRoundParams,
    parsed: ParsedToolCall,
  ): RemappedToolCall | null {
    const { allowedToolNames, context, model, source, strategy, threadId } =
      params;
    const { rawRequestedToolName, requestedToolName } = parsed;
    let { toolParams } = parsed;
    let toolName = requestedToolName;

    if (!allowedToolNames.has(requestedToolName)) {
      const recovered = this.getGenerationPreparationRedirect(
        rawRequestedToolName,
        allowedToolNames,
        context.generationMode,
        toolParams,
      );

      if (recovered) {
        allowedToolNames.add(recovered.toolName);
        toolName = recovered.toolName;
        toolParams = buildUnknownToolRecoveryParams(
          rawRequestedToolName,
          toolParams,
          recovered,
        );

        this.loggerService.warn(
          `Recovered unknown tool ${rawRequestedToolName} -> ${recovered.toolName}`,
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
      } else if (!strategy?.deferUnknownToolFailure) {
        return null;
      }
    }

    const preRemapToolName = toolName;
    const directGenerationOverride = this.getGenerationPreparationRedirect(
      toolName,
      allowedToolNames,
      context.generationMode,
      toolParams,
    );
    if (directGenerationOverride) {
      allowedToolNames.add(directGenerationOverride.toolName);
      const originalToolName = toolName;
      toolName = directGenerationOverride.toolName;
      toolParams = buildUnknownToolRecoveryParams(
        rawRequestedToolName,
        toolParams,
        directGenerationOverride,
      );

      this.loggerService.log(
        `Remapped direct generation tool ${originalToolName} -> ${directGenerationOverride.toolName}${directGenerationOverride.mediaType ? ` (${directGenerationOverride.mediaType})` : ''}`,
        {
          organizationId: context.organizationId,
          source: source ?? 'agent',
          threadId,
          userId: context.userId,
        },
      );
    }

    return { preRemapToolName, toolName, toolParams };
  }

  /**
   * Bills, summarizes and emits one executed tool call, then appends its
   * model-visible result to the conversation.
   */
  private async recordExecutedToolCall(
    params: ExecuteToolRoundParams,
    toolCall: OpenRouterToolCallResponse,
    executed: { invocation: ToolInvocation; result: AgentToolResult },
  ): Promise<ToolCallOutcome> {
    const {
      context,
      messages,
      policy,
      state,
      strategy = {},
      threadId,
    } = params;
    const { invocation, result } = executed;
    const { creditCost, requestedToolName, startTime, toolName, toolParams } =
      invocation;
    const modelVisibleResult =
      this.toolConfirmationService.buildModelVisibleResult(toolName, result);

    const durationMs = Date.now() - startTime;
    state.artifactMetadata.push(buildArtifactMetadata(result.data, context));

    if (result.nextActions?.length) {
      state.uiActions.push(...result.nextActions);
    }
    const terminal = resolveTerminalToolOutcome(toolName, toolParams, result);
    if (result.requiresConfirmation) {
      state.reviewRequired = true;
    }
    this.recordRiskLevel(state, result.riskLevel);

    // Generation tools may bill themselves (dynamic amount). Do not also
    // deduct the catalog creditCost. Still record result.creditsUsed so the
    // turn total and UI reflect real spend.
    // Bill + record the summary *before* onAfterTool cancel: the tool already
    // ran (side effects done). Cancelled streams must still charge
    // orchestrator-billed tools and leave an audit trail.
    const isOrchestratorBilled =
      result.success && creditCost > 0 && !result.isBillingDelegated;
    const delegatedCredits = result.isBillingDelegated
      ? Math.max(0, result.creditsUsed ?? 0)
      : 0;

    if (isOrchestratorBilled) {
      await this.creditsUtilsService.deductCreditsFromOrganization(
        context.organizationId,
        context.userId,
        creditCost,
        `Agent tool: ${toolName}`,
        ActivitySource.SCRIPT,
        { brandId: context.scope?.brandId },
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
      ...buildToolResultSummary(toolName, modelVisibleResult),
      ...(isApprovalPendingResult(result)
        ? { resultSummary: APPROVAL_PENDING_RESULT_SUMMARY }
        : {}),
      status: result.success ? 'completed' : 'failed',
      toolName,
    };
    state.toolCalls.push(summary);

    if (strategy.onAfterTool) {
      const action = await strategy.onAfterTool();
      if (action === 'cancel') {
        return {
          kind: 'cancelled',
          result: { isCancelled: true, wasInterrupted: true },
        };
      }
    }

    if (toolName === 'render_dashboard' && result.data?.uiBlocks) {
      await recordDashboardBlocks(state, strategy, result.data);
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
      content: await this.gateToolResultContent({
        context,
        modelVisibleResult,
        policy,
        state,
        threadId,
        toolCall,
        toolName,
        toolParams,
      }),
      role: 'tool' as const,
      tool_call_id: toolCall.id,
    });

    return { kind: 'completed', terminal };
  }

  /**
   * What the model is allowed to see of one tool result (#4870).
   *
   * The injection gate only ever tightens this: above its threshold in `live`
   * mode it returns a withheld notice, and every other outcome — `off`,
   * `shadow`, a sub-threshold or unavailable decision, a thrown error — hands
   * back exactly the serialized result.
   */
  private async gateToolResultContent(params: {
    context: AgentChatContext;
    modelVisibleResult: AgentToolResult;
    policy: ResolvedAgentExecutionPolicy;
    state: AgentToolRoundState;
    threadId: string;
    toolCall: OpenRouterToolCallResponse;
    toolName: CuratedActionName;
    toolParams: Record<string, unknown>;
  }): Promise<string> {
    const annotated =
      params.toolName === 'search_knowledge' && params.modelVisibleResult.data
        ? annotateKnowledgeSearchData(
            params.state,
            params.modelVisibleResult.data,
            readBrandId(params.toolParams) ?? params.context.scope?.brandId,
          )
        : null;
    const visibleResult = annotated
      ? { ...params.modelVisibleResult, data: annotated.data }
      : params.modelVisibleResult;
    const content = JSON.stringify(visibleResult);
    const gated = await this.untrustedContentGateService.evaluateToolResult({
      origin: 'agent',
      brandId: params.policy.brandId,
      content,
      context: params.context,
      threadId: params.threadId,
      toolCallId: params.toolCall.id,
      toolName: params.toolName,
    });

    // A withheld or rewritten result is not what was numbered, so none of its
    // passages are citable.
    if (annotated && gated.content !== content) {
      for (const id of annotated.ids)
        params.state.knowledgePassages?.delete(id);
    }
    return gated.content;
  }

  /**
   * Turns citation markers in the final answer into verified, numbered sources.
   * Shared by sync and stream loops; `metadata` is spread into the response.
   */
  async finalizeKnowledgeCitations(
    content: string,
    state: AgentToolRoundState,
    context: AgentChatContext,
  ): Promise<{ content: string; metadata: Record<string, unknown> }> {
    const finalized = await this.citationService?.finalize(
      content,
      state.knowledgePassages,
      context,
    );
    return {
      content: finalized?.content ?? content,
      metadata: finalized?.knowledgeCitations
        ? { knowledgeCitations: finalized.knowledgeCitations }
        : {},
    };
  }

  private readCurrentOperatorMessage(
    messages: OpenRouterMessage[],
    source: AgentChatRequest['source'] | undefined,
  ): string | null {
    if ((source ?? 'agent') !== 'agent') {
      return null;
    }

    return readLatestOperatorMessage(messages);
  }

  private buildUnknownToolError(
    toolName: string,
    allowedTools: Set<CuratedActionName>,
  ): string {
    const knownTools = Array.from(allowedTools).sort();
    const maxPreview = 15;
    const preview = knownTools.slice(0, maxPreview).join(', ');
    const suffix = knownTools.length > maxPreview ? ', ...' : '';

    return `Unknown tool requested by model: ${toolName}. Available tools: ${preview}${suffix}`;
  }

  private getGenerationPreparationRedirect(
    toolName: string,
    allowedTools: Set<CuratedActionName>,
    generationMode: AgentChatContext['generationMode'] | undefined,
    toolParams: Record<string, unknown>,
  ): GenerationRedirect | null {
    return getGenerationPreparationRedirect(toolName, allowedTools, {
      generationMode,
      requestedGenerationType: toolParams.generationType,
      requestedMediaType: toolParams.type,
    });
  }

  /**
   * Runs one tool call, but stops waiting when the run is cancelled (`null`) or
   * the call outlives `TOOL_EXECUTION_TIMEOUT_MS` (a failed tool result).
   */
  private async executeToolUntilSettled(
    params: ExecuteToolRoundParams,
    toolName: CuratedActionName,
    preparedToolCall: Awaited<
      ReturnType<AgentToolConfirmationService['prepareToolCall']>
    >,
  ): Promise<AgentToolResult | null> {
    const { onBeforeTool } = params.strategy ?? {};
    const outcome = await raceToolExecution(
      this.toolExecutorService.executeTool(
        toolName,
        preparedToolCall.parameters,
        this.buildToolExecutionContext(
          params,
          preparedToolCall.confirmationContext,
        ),
      ),
      {
        isCancelled: onBeforeTool
          ? async () => (await onBeforeTool()) === 'cancel'
          : undefined,
        pollIntervalMs: TOOL_CANCEL_POLL_INTERVAL_MS,
        timeoutMs: TOOL_EXECUTION_TIMEOUT_MS,
      },
    );
    const logContext = { threadId: params.threadId, toolName };
    if (outcome.kind === 'cancelled') {
      this.loggerService.warn(
        `${this.constructorName} run cancelled while ${toolName} was still running`,
        logContext,
      );
      return null;
    }
    if (outcome.kind === 'timed-out') {
      this.loggerService.error(
        `${this.constructorName} tool execution timed out`,
        logContext,
      );
      return {
        creditsUsed: 0,
        error: `${toolName} did not finish within ${TOOL_EXECUTION_TIMEOUT_MS / 1000}s`,
        success: false,
      };
    }
    return outcome.value;
  }

  private buildToolExecutionContext(
    params: ExecuteToolRoundParams,
    confirmationContext: Awaited<
      ReturnType<AgentToolConfirmationService['prepareToolCall']>
    >['confirmationContext'],
  ): ToolExecutionContext {
    const {
      attachmentUrls,
      context,
      generationPriority,
      policy,
      thinkingModel,
      threadId,
    } = params;
    return {
      isProactive: params.source === 'proactive',
      ...(context.agentBrief ? { agentBrief: context.agentBrief } : {}),
      apiKeyContext: context.apiKeyContext,
      initiatingPrincipal: context.initiatingPrincipal,
      attachmentUrls,
      autonomyMode: context.autonomyMode ?? policy.autonomyMode,
      ...(context.creditBudget !== undefined
        ? {
            creditBudget: Math.max(
              0,
              context.creditBudget - params.state.totalCreditsUsed,
            ),
          }
        : {}),
      brandId: policy.brandId,
      creditGovernance: policy.creditGovernance,
      generationModelOverride: policy.generationModelOverride,
      generationMode: context.generationMode,
      generationEntry: context.generationEntry,
      generationPriority,
      generationSettings: context.generationSettings,
      knowledgeSelection: context.knowledgeSelection,
      ...(context.requestedSkillSlugs?.length
        ? { requestedSkillSlugs: context.requestedSkillSlugs }
        : {}),
      organizationId: context.organizationId,
      platform: policy.platform,
      qualityTier: policy.qualityTier,
      reviewModelOverride: policy.reviewModelOverride,
      runId: context.executionId,
      hostSupportsApproval: context.hostSupportsApproval ?? true,
      ...(confirmationContext ?? {}),
      ...(hasGenerationHoldIntent(
        this.readCurrentOperatorMessage(params.messages, params.source),
      )
        ? { isGenerationReviewRequested: true }
        : {}),
      strategyId: context.strategyId,
      thinkingModel,
      threadId,
      userId: context.userId,
      validatedScope: policy.scope,
    };
  }

  private recordRiskLevel(
    state: { highestRiskLevel: AgentToolRoundRiskLevel },
    riskLevel: string | undefined,
  ): void {
    if (riskLevel === 'high') state.highestRiskLevel = 'high';
    else if (riskLevel === 'medium' && state.highestRiskLevel === 'low')
      state.highestRiskLevel = 'medium';
  }
}
