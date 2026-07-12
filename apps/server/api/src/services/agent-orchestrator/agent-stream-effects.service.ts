import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { fromPromiseEffect } from '@api/helpers/utils/effect/effect.util';
import type {
  AgentChatContext,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/agent-orchestrator.service';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import {
  type AgentDashboardOperation,
  type AgentUIBlocksEvent,
  type AgentUiAction,
} from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

@Injectable()
export class AgentStreamEffectsService {
  constructor(
    private readonly streamPublisher: AgentStreamPublisherService,
    @Optional()
    private readonly agentRunsService?: AgentRunsService,
  ) {}

  publishStreamLifecycleStartedEffect(params: {
    context: AgentChatContext;
    model: string;
    startedAt?: string;
    threadId: string;
  }): Effect.Effect<void, unknown> {
    return this.publishStreamStartEffect({
      model: params.model,
      runId: params.context.runId,
      startedAt: params.startedAt,
      threadId: params.threadId,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          event: 'started',
          label: 'Agent started',
          runId: params.context.runId,
          startedAt: params.startedAt,
          status: 'running',
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  publishStreamStartEffect(
    data: Parameters<AgentStreamPublisherService['publishStreamStart']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishStreamStartEffect(data);
  }

  publishStreamTokenEffect(
    data: Parameters<AgentStreamPublisherService['publishToken']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishTokenEffect(data);
  }

  publishStreamReasoningEffect(
    data: Parameters<AgentStreamPublisherService['publishReasoning']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishReasoningEffect(data);
  }

  publishStreamDoneEffect(
    data: Parameters<AgentStreamPublisherService['publishDone']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishDoneEffect(data);
  }

  publishStreamToolStartEffect(
    data: Parameters<AgentStreamPublisherService['publishToolStart']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishToolStartEffect(data);
  }

  publishStreamToolCompleteEffect(
    data: Parameters<AgentStreamPublisherService['publishToolComplete']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishToolCompleteEffect(data);
  }

  publishStreamErrorEffect(
    data: Parameters<AgentStreamPublisherService['publishError']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishErrorEffect(data);
  }

  publishStreamWorkEventEffect(
    data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishWorkEventEffect(data);
  }

  publishStreamUiBlocksEventEffect(
    data: Parameters<AgentStreamPublisherService['publishUIBlocks']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishUIBlocksEffect(data);
  }

  publishStreamInputRequestEventEffect(
    data: Parameters<AgentStreamPublisherService['publishInputRequest']>[0],
  ): Effect.Effect<void, unknown> {
    return this.streamPublisher.publishInputRequestEffect(data);
  }

  publishStreamAssistantResponseEffect(params: {
    content: string;
    context: AgentChatContext;
    reasoning: string | null;
    threadId: string;
    suppressTokenStreaming?: boolean;
  }): Effect.Effect<void, unknown> {
    const publishReasoningEffect = params.reasoning
      ? this.publishStreamReasoningEffect({
          content: params.reasoning!,
          runId: params.context.runId,
          threadId: params.threadId,
          userId: params.context.userId,
        }).pipe(Effect.catchAll(() => Effect.void))
      : Effect.void;

    // Real streaming already emitted the tokens live this turn — only the
    // reasoning still needs publishing; the final content arrives via
    // agent:done. Otherwise fall back to simulated word-split token streaming.
    if (params.suppressTokenStreaming) {
      return publishReasoningEffect.pipe(Effect.catchAll(() => Effect.void));
    }

    const words = params.content.split(/(\s+)/).filter(Boolean);

    return publishReasoningEffect.pipe(
      Effect.zipRight(
        Effect.forEach(
          words,
          (word) =>
            this.publishStreamTokenEffect({
              runId: params.context.runId,
              threadId: params.threadId,
              token: word,
              userId: params.context.userId,
            }).pipe(Effect.catchAll(() => Effect.void)),
          { discard: true },
        ),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  publishStreamCompletionEffect(params: {
    completionMetadata: Record<string, unknown>;
    content: string;
    context: AgentChatContext;
    creditsRemaining: number;
    creditsUsed: number;
    durationMs?: number;
    runStartedAt?: string;
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Effect.Effect<void, unknown> {
    return this.publishStreamDoneEffect({
      creditsRemaining: params.creditsRemaining,
      creditsUsed: params.creditsUsed,
      durationMs: params.durationMs,
      fullContent: params.content,
      metadata: params.completionMetadata,
      runId: params.context.runId,
      startedAt: params.runStartedAt,
      threadId: params.threadId,
      toolCalls: params.toolCalls,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: `${params.toolCalls.length} tool call${params.toolCalls.length === 1 ? '' : 's'} completed`,
          event: 'completed',
          label: 'Agent completed',
          runId: params.context.runId,
          status: 'completed',
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  publishStreamDoneOnlyEffect(params: {
    content: string;
    context: AgentChatContext;
    creditsRemaining: number;
    creditsUsed: number;
    metadata: Record<string, unknown>;
    startedAt?: string;
    threadId: string;
    toolCalls: ToolCallSummary[];
  }): Effect.Effect<void, unknown> {
    return this.publishStreamDoneEffect({
      creditsRemaining: params.creditsRemaining,
      creditsUsed: params.creditsUsed,
      fullContent: params.content,
      metadata: params.metadata,
      runId: params.context.runId,
      startedAt: params.startedAt,
      threadId: params.threadId,
      toolCalls: params.toolCalls,
      userId: params.context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  publishStreamingToolStartedEffect(params: {
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
  }): Effect.Effect<void, unknown> {
    const detail = params.detail ?? `Starting ${params.toolName}`;
    const label = params.label ?? params.toolName;
    const progress = params.progress ?? 15;

    return this.publishStreamToolStartEffect({
      detail,
      label,
      parameters: params.parameters,
      phase: 'executing',
      progress,
      runId: params.context.runId,
      startedAt: params.startedAt,
      threadId: params.threadId,
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: params.workEventDetail ?? `Running ${params.toolName}`,
          event: 'tool_started',
          label: params.workEventLabel ?? label,
          parameters: params.parameters,
          phase: 'executing',
          progress,
          runId: params.context.runId,
          startedAt: params.startedAt,
          status: 'running',
          threadId: params.threadId,
          toolCallId: params.toolCallId,
          toolName: params.toolName,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  publishStreamUiBlocksEffect(params: {
    blockIds?: string[];
    blocks?: AgentUIBlocksEvent['blocks'];
    context: AgentChatContext;
    operation: AgentDashboardOperation;
    runId?: string;
    threadId: string;
  }): Effect.Effect<void, unknown> {
    return this.publishStreamUiBlocksEventEffect({
      blockIds: params.blockIds,
      blocks: params.blocks,
      operation: params.operation,
      runId: params.runId ?? params.context.runId,
      threadId: params.threadId,
      userId: params.context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  publishStreamInputRequestEffect(params: {
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
  }): Effect.Effect<void, unknown> {
    return this.publishStreamInputRequestEventEffect({
      allowFreeText: params.allowFreeText,
      fieldId: params.fieldId,
      inputRequestId: params.inputRequestId,
      metadata: params.metadata,
      options: params.options,
      prompt: params.prompt,
      recommendedOptionId: params.recommendedOptionId,
      runId: params.runId ?? params.context.runId,
      threadId: params.threadId,
      title: params.title,
      userId: params.context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }

  publishStreamingToolCompletedEffect(params: {
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
  }): Effect.Effect<void, unknown> {
    const label = params.label ?? params.toolName;
    const phase = params.status === 'completed' ? 'completed' : 'failed';

    return this.publishStreamToolCompleteEffect({
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
      runId: params.context.runId,
      status: params.status,
      threadId: params.threadId,
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      uiActions: params.uiActions,
      userId: params.context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: params.detail,
          event: 'tool_completed',
          label,
          parameters: params.parameters,
          phase,
          progress: 100,
          resultSummary: params.resultSummary,
          runId: params.context.runId,
          status: params.status,
          threadId: params.threadId,
          toolCallId: params.toolCallId,
          toolName: params.toolName,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  publishStreamFailureEffect(params: {
    context: AgentChatContext;
    error: string;
    failRun: boolean;
    threadId: string;
  }): Effect.Effect<void, unknown> {
    const failRunEffect =
      params.failRun && params.context.runId && this.agentRunsService
        ? fromPromiseEffect(() =>
            this.agentRunsService?.fail(
              params.context.runId!,
              params.context.organizationId,
              params.error,
            ),
          ).pipe(Effect.asVoid)
        : Effect.void;

    return failRunEffect.pipe(
      Effect.zipRight(
        this.publishStreamErrorEffect({
          error: params.error,
          runId: params.context.runId,
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: params.error,
          event: 'failed',
          label: 'Agent failed',
          runId: params.context.runId,
          status: 'failed',
          threadId: params.threadId,
          userId: params.context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  publishStreamCancelledEffect(
    context: AgentChatContext,
    threadId: string,
  ): Effect.Effect<void, unknown> {
    return this.publishStreamErrorEffect({
      error: 'Agent run cancelled',
      runId: context.runId,
      threadId,
      userId: context.userId,
    }).pipe(
      Effect.zipRight(
        this.publishStreamWorkEventEffect({
          detail: 'The active run was stopped by the user.',
          event: 'cancelled',
          label: 'Agent cancelled',
          runId: context.runId,
          status: 'cancelled',
          threadId,
          userId: context.userId,
        }),
      ),
      Effect.catchAll(() => Effect.void),
    );
  }

  publishStreamErrorOnlyEffect(
    context: AgentChatContext,
    threadId: string,
    error: string,
  ): Effect.Effect<void, unknown> {
    return this.publishStreamErrorEffect({
      error,
      runId: context.runId,
      threadId,
      userId: context.userId,
    }).pipe(Effect.catchAll(() => Effect.void));
  }
}
