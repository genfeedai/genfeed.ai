import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import type {
  AgentChatContext,
  AgentChatResult,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { formatAgentError } from '@genfeedai/agent/server';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import {
  type AgentDashboardOperation,
  type AgentUIBlocksEvent,
  type AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentStreamEffectsService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly streamPublisher: AgentStreamPublisherService,
    private readonly loggerService: LoggerService,
    private readonly activityRecorder: ActivityRecorderService,
  ) {}

  async publishTurnPhase(
    data: Parameters<AgentStreamPublisherService['publishTurnPhase']>[0],
  ): Promise<void> {
    try {
      await this.streamPublisher.publishTurnPhase(data);
    } catch {
      this.loggerService.warn(
        `${this.constructorName} turn phase publish failed`,
        {
          phase: data.phase.replace(/[^a-z_]/g, ''),
          runId: data.runId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128),
        },
      );
    }
  }

  async publishStreamLifecycleStarted(params: {
    context: AgentChatContext;
    model: string;
    startedAt?: string;
    threadId: string;
  }): Promise<void> {
    try {
      await this.publishStreamStart({
        model: params.model,
        runId: params.context.executionId,
        startedAt: params.startedAt,
        threadId: params.threadId,
        userId: params.context.userId,
      });
      await this.publishStreamWorkEvent({
        event: 'started',
        label: 'Agent started',
        runId: params.context.executionId,
        startedAt: params.startedAt,
        status: 'running',
        threadId: params.threadId,
        userId: params.context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} stream lifecycle started publish failed`,
        { error },
      );
    }
  }

  async publishStreamStart(
    data: Parameters<AgentStreamPublisherService['publishStreamStart']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishStreamStart(data);
  }

  async publishStreamToken(
    data: Parameters<AgentStreamPublisherService['publishToken']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishToken(data);
  }

  async publishStreamReasoning(
    data: Parameters<AgentStreamPublisherService['publishReasoning']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishReasoning(data);
  }

  async publishStreamDone(
    data: Parameters<AgentStreamPublisherService['publishDone']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishDone(data);
  }

  async publishStreamToolStart(
    data: Parameters<AgentStreamPublisherService['publishToolStart']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishToolStart(data);
  }

  async publishStreamToolComplete(
    data: Parameters<AgentStreamPublisherService['publishToolComplete']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishToolComplete(data);
  }

  async publishStreamError(
    data: Parameters<AgentStreamPublisherService['publishError']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishError(data);
  }

  async publishStreamWorkEvent(
    data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishWorkEvent(data);
  }

  async publishStreamUiBlocksEvent(
    data: Parameters<AgentStreamPublisherService['publishUIBlocks']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishUIBlocks(data);
  }

  async publishStreamInputRequestEvent(
    data: Parameters<AgentStreamPublisherService['publishInputRequest']>[0],
  ): Promise<void> {
    await this.streamPublisher.publishInputRequest(data);
  }

  async publishStreamAssistantResponse(params: {
    content: string;
    context: AgentChatContext;
    reasoning: string | null;
    threadId: string;
    suppressTokenStreaming?: boolean;
  }): Promise<void> {
    if (params.reasoning) {
      try {
        await this.publishStreamReasoning({
          content: params.reasoning,
          runId: params.context.executionId,
          threadId: params.threadId,
          userId: params.context.userId,
        });
      } catch (error) {
        this.loggerService.warn(
          `${this.constructorName} assistant reasoning publish failed`,
          { error },
        );
      }
    }

    // Real streaming already emitted the tokens live this turn — only the
    // reasoning still needs publishing; the final content arrives via
    // agent:done. Otherwise fall back to simulated word-split token streaming.
    if (params.suppressTokenStreaming) {
      return;
    }

    const words = params.content.split(/(\s+)/).filter(Boolean);

    for (const word of words) {
      try {
        await this.publishStreamToken({
          runId: params.context.executionId,
          threadId: params.threadId,
          token: word,
          userId: params.context.userId,
        });
      } catch (error) {
        this.loggerService.warn(
          `${this.constructorName} assistant token publish failed`,
          { error },
        );
      }
    }
  }

  async publishStreamCompletion(params: {
    completionMetadata: Record<string, unknown>;
    content: string;
    context: AgentChatContext;
    creditsRemaining: number;
    creditsUsed: number;
    durationMs?: number;
    runStartedAt?: string;
    threadId: string;
    threadTitle?: string;
    toolCalls: ToolCallSummary[];
  }): Promise<void> {
    try {
      await this.publishStreamDone({
        creditsRemaining: params.creditsRemaining,
        creditsUsed: params.creditsUsed,
        durationMs: params.durationMs,
        fullContent: params.content,
        metadata: params.completionMetadata,
        runId: params.context.executionId,
        startedAt: params.runStartedAt,
        threadId: params.threadId,
        threadTitle: params.threadTitle,
        toolCalls: params.toolCalls,
        userId: params.context.userId,
      });
      await this.publishStreamWorkEvent({
        detail: `${params.toolCalls.length} tool call${params.toolCalls.length === 1 ? '' : 's'} completed`,
        event: 'completed',
        label: 'Agent completed',
        runId: params.context.executionId,
        status: 'completed',
        threadId: params.threadId,
        userId: params.context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} stream completion publish failed`,
        { error },
      );
    }
  }

  async publishStreamDoneOnly(params: {
    content: string;
    context: AgentChatContext;
    creditsRemaining: number;
    creditsUsed: number;
    metadata: Record<string, unknown>;
    startedAt?: string;
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Promise<void> {
    try {
      await this.publishStreamDone({
        creditsRemaining: params.creditsRemaining,
        creditsUsed: params.creditsUsed,
        fullContent: params.content,
        metadata: params.metadata,
        runId: params.context.executionId,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCalls: params.toolCalls,
        userId: params.context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} stream done publish failed`,
        { error },
      );
    }
  }

  /**
   * A ui-action run settles on the turn channel: its result reaches the client
   * as the same `agent:done` a turn emits, so the stream that adopted the run
   * finalizes it like any other.
   */
  async publishUiActionDone(params: {
    context: AgentChatContext;
    result: AgentChatResult;
    sequence?: number;
    threadId: string;
    uiAction: { action: string; sourceId: string };
  }): Promise<void> {
    try {
      await this.streamPublisher.publishRecordedRunSettled({
        data: {
          brandId: params.result.brandId,
          contextVersion: params.result.contextVersion,
          creditsRemaining: params.result.creditsRemaining,
          creditsUsed: params.result.creditsUsed,
          fullContent: params.result.message.content,
          metadata: {
            ...params.result.message.metadata,
            ...(params.context.executionId
              ? { runId: params.context.executionId }
              : {}),
          },
          runId: params.context.executionId,
          ...(params.result.runOutcome
            ? {
                error: params.result.runOutcome.error,
                runStatus: params.result.runOutcome.status,
              }
            : { runStatus: 'completed' as const }),
          sequence: params.sequence,
          threadId: params.threadId,
          toolCalls: params.result.toolCalls,
          uiAction: params.uiAction,
          userId: params.context.userId,
        },
        type: 'agent:done',
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} ui-action done publish failed`,
        { error },
      );
    }
  }

  async publishUiActionFailure(params: {
    context: AgentChatContext;
    error: string;
    sequence?: number;
    threadId: string;
    uiAction: { action: string; sourceId: string };
  }): Promise<void> {
    try {
      await this.streamPublisher.publishRecordedRunSettled({
        data: {
          error: params.error,
          runId: params.context.executionId,
          sequence: params.sequence,
          threadId: params.threadId,
          uiAction: params.uiAction,
          userId: params.context.userId,
        },
        type: 'agent:error',
      });
    } catch (error) {
      await this.recordFailureDeliveryError(
        params.context,
        params.threadId,
        error,
      );
    }
  }

  async publishStreamingToolStarted(params: {
    context: AgentChatContext;
    detail?: string;
    label?: string;
    parameters: Record<string, unknown>;
    progress?: number;
    startedAt: string;
    threadId: string;
    toolCallId: string;
    toolName: string;
    workEventDetail?: string;
    workEventLabel?: string;
  }): Promise<void> {
    const detail = params.detail ?? `Starting ${params.toolName}`;
    const label = params.label ?? params.toolName;
    // Only publish determinate progress when the caller has real progress.
    // Defaulting to 15% made every tool look stuck at a fake quarter bar.
    const progress = params.progress;

    try {
      await this.publishStreamToolStart({
        detail,
        label,
        parameters: params.parameters,
        phase: 'executing',
        progress,
        runId: params.context.executionId,
        startedAt: params.startedAt,
        threadId: params.threadId,
        toolCallId: params.toolCallId,
        toolName: params.toolName,
        userId: params.context.userId,
      });
      await this.publishStreamWorkEvent({
        detail: params.workEventDetail ?? `Running ${params.toolName}`,
        event: 'tool_started',
        label: params.workEventLabel ?? label,
        parameters: params.parameters,
        phase: 'executing',
        progress,
        runId: params.context.executionId,
        startedAt: params.startedAt,
        status: 'running',
        threadId: params.threadId,
        toolCallId: params.toolCallId,
        toolName: params.toolName,
        userId: params.context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} tool started publish failed`,
        { error },
      );
    }
  }

  async publishStreamUiBlocks(params: {
    blockIds?: string[];
    blocks?: AgentUIBlocksEvent['blocks'];
    context: AgentChatContext;
    operation: AgentDashboardOperation;
    runId?: string;
    threadId: string;
  }): Promise<void> {
    try {
      await this.publishStreamUiBlocksEvent({
        blockIds: params.blockIds,
        blocks: params.blocks,
        operation: params.operation,
        runId: params.runId ?? params.context.executionId,
        threadId: params.threadId,
        userId: params.context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} ui blocks publish failed`,
        { error },
      );
    }
  }

  async publishStreamInputRequest(params: {
    allowFreeText?: boolean;
    context: AgentChatContext;
    fieldId?: string;
    inputRequestId: string;
    metadata?: Record<string, unknown>;
    options?: Array<{
      description?: string;
      id: string;
      label: string;
    }>;
    prompt: string;
    recommendedOptionId?: string;
    runId?: string;
    threadId: string;
    title: string;
  }): Promise<void> {
    try {
      await this.publishStreamInputRequestEvent({
        allowFreeText: params.allowFreeText,
        fieldId: params.fieldId,
        inputRequestId: params.inputRequestId,
        metadata: params.metadata,
        options: params.options,
        prompt: params.prompt,
        recommendedOptionId: params.recommendedOptionId,
        runId: params.runId ?? params.context.executionId,
        threadId: params.threadId,
        title: params.title,
        userId: params.context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} input request publish failed`,
        { error },
      );
    }
  }

  async publishStreamingToolCompleted(params: {
    context: AgentChatContext;
    creditsUsed?: number;
    debug?: Record<string, unknown>;
    detail?: string;
    durationMs: number;
    error?: string;
    label?: string;
    parameters?: Record<string, unknown>;
    resultSummary?: string;
    status: 'completed' | 'failed';
    threadId: string;
    toolCallId: string;
    toolName: string;
    uiActions?: AgentUiAction[];
  }): Promise<void> {
    const label = params.label ?? params.toolName;
    const phase = params.status === 'completed' ? 'completed' : 'failed';

    try {
      await this.publishStreamToolComplete({
        creditsUsed: params.creditsUsed ?? 0,
        debug: params.debug,
        detail: params.detail,
        durationMs: params.durationMs,
        error: params.error,
        label,
        parameters: params.parameters,
        phase,
        progress: 100,
        resultSummary: params.resultSummary,
        runId: params.context.executionId,
        status: params.status,
        threadId: params.threadId,
        toolCallId: params.toolCallId,
        toolName: params.toolName,
        uiActions: params.uiActions,
        userId: params.context.userId,
      });
      await this.publishStreamWorkEvent({
        detail: params.detail,
        event: 'tool_completed',
        label,
        parameters: params.parameters,
        phase,
        progress: 100,
        resultSummary: params.resultSummary,
        runId: params.context.executionId,
        status: params.status,
        threadId: params.threadId,
        toolCallId: params.toolCallId,
        toolName: params.toolName,
        userId: params.context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} tool completed publish failed`,
        { error },
      );
    }
  }

  async publishStreamFailure(params: {
    context: AgentChatContext;
    error: string;
    threadId: string;
  }): Promise<void> {
    try {
      await this.publishStreamError({
        error: params.error,
        runId: params.context.executionId,
        threadId: params.threadId,
        userId: params.context.userId,
      });
      await this.publishStreamWorkEvent({
        detail: params.error,
        event: 'failed',
        label: 'Agent failed',
        runId: params.context.executionId,
        status: 'failed',
        threadId: params.threadId,
        userId: params.context.userId,
      });
    } catch (error) {
      await this.recordFailureDeliveryError(
        params.context,
        params.threadId,
        error,
      );
    }
  }

  async publishStreamCancelled(
    context: AgentChatContext,
    threadId: string,
    interrupted = false,
  ): Promise<void> {
    try {
      await this.publishStreamError({
        error: 'Agent run cancelled',
        runId: context.executionId,
        threadId,
        userId: context.userId,
      });
      await this.publishStreamWorkEvent({
        detail: 'The active run was stopped by the user.',
        event: interrupted ? 'interrupted' : 'cancelled',
        label: interrupted ? 'Work interrupted' : 'Agent cancelled',
        runId: context.executionId,
        status: 'cancelled',
        threadId,
        userId: context.userId,
      });
    } catch (error) {
      this.loggerService.warn(
        `${this.constructorName} stream cancelled publish failed`,
        { error },
      );
    }
  }

  async publishStreamErrorOnly(
    context: AgentChatContext,
    threadId: string,
    error: string,
  ): Promise<void> {
    try {
      await this.publishStreamError({
        error,
        runId: context.executionId,
        threadId,
        userId: context.userId,
      });
    } catch (publishError) {
      await this.recordFailureDeliveryError(context, threadId, publishError);
    }
  }
  private async recordFailureDeliveryError(
    context: AgentChatContext,
    threadId: string,
    error: unknown,
  ): Promise<void> {
    const failure = {
      ...formatAgentError(
        error instanceof Error ? error.message : 'Stream publication failed',
      ),
      detail: null,
    };
    this.loggerService.warn(
      `${this.constructorName} stream failure publish failed`,
      { failure, runId: context.executionId, threadId: threadId },
    );
    const sourceId = context.executionId ?? threadId;
    // The deterministic id makes a repeated failure for the same run a no-op.
    await this.activityRecorder.record({
      data: { channel: 'stream', failure, threadId },
      entityId: sourceId,
      entityModel: context.executionId ? 'AgentRun' : 'AgentThread',
      id: `${ActivityKey.AGENT_RUN_DELIVERY_FAILED}:${context.organizationId}:${sourceId}`,
      key: ActivityKey.AGENT_RUN_DELIVERY_FAILED,
      organizationId: context.organizationId,
      source: ActivitySource.AGENT_RUN,
      userId: context.userId,
      value: failure.summary,
    });
  }
}
