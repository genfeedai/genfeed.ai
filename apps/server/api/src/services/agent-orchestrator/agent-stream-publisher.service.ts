import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import {
  AgentThreadEngineService,
  type AppendAgentThreadEventParams,
} from '@api/services/agent-threading/services/agent-thread-engine.service';
import type {
  AgentDashboardOperation,
  AgentUIBlock,
  AgentUiAction,
} from '@genfeedai/interfaces';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, Optional } from '@nestjs/common';
import type { StructuredProgressDebugPayload } from '@utils/progress/structured-progress-event.util';
import { Effect } from 'effect';

const CHANNEL = 'agent-chat';

@Injectable()
export class AgentStreamPublisherService {
  constructor(
    private readonly redisService: RedisService,
    @Optional()
    private readonly agentThreadsService?: AgentThreadsService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
  ) {}

  private async persistThreadEvent(
    threadId: string,
    params: {
      commandId: string;
      type:
        | 'assistant.delta'
        | 'assistant.finalized'
        | 'error.raised'
        | 'input.requested'
        | 'input.resolved'
        | 'thread.turn_started'
        | 'tool.completed'
        | 'tool.progress'
        | 'tool.started'
        | 'ui.blocks_updated'
        | 'work.completed'
        | 'work.started'
        | 'work.updated'
        | 'run.cancelled'
        | 'run.completed'
        | 'run.failed';
      payload: Record<string, unknown>;
      runId?: string;
      userId?: string;
    },
  ): Promise<void> {
    if (!this.agentThreadEngineService || !this.agentThreadsService) {
      return;
    }
    try {
      if (!ObjectIdUtil.isValid(threadId)) {
        return;
      }

      const thread = await this.agentThreadsService.findOne({
        _id: threadId,
        isDeleted: false,
      });

      if (!thread?.organization) {
        return;
      }

      await runEffectPromise(
        this.appendThreadEventEffect({
          commandId: params.commandId,
          metadata: { origin: 'stream-publisher' },
          organizationId: String(thread.organization),
          payload: params.payload,
          runId: params.runId,
          threadId,
          type: params.type,
          userId: params.userId,
        }),
      );
    } catch {
      // Persisted thread events should not break live stream fan-out.
    }
  }

  private appendThreadEventEffect(
    params: AppendAgentThreadEventParams,
  ): Effect.Effect<void, unknown> {
    if (!this.agentThreadEngineService) {
      return Effect.void;
    }

    return this.agentThreadEngineService
      .appendEventEffect(params)
      .pipe(Effect.asVoid);
  }

  publishStreamStartEffect(
    data: Parameters<AgentStreamPublisherService['publishStreamStart']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishStreamStart(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishStreamStart(data: {
    threadId: string;
    model: string;
    runId?: string;
    startedAt?: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `thread-start:${data.threadId}:${data.runId ?? data.startedAt ?? 'stream'}`,
      payload: {
        model: data.model,
        startedAt: data.startedAt,
      },
      runId: data.runId,
      type: 'thread.turn_started',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:stream_start',
    });
  }

  publishTokenEffect(
    data: Parameters<AgentStreamPublisherService['publishToken']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishToken(data)).pipe(Effect.asVoid);
  }

  async publishToken(data: {
    threadId: string;
    runId?: string;
    token: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `assistant-delta:${data.threadId}:${data.runId ?? 'stream'}`,
      payload: {
        content: data.token,
      },
      runId: data.runId,
      type: 'assistant.delta',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:token',
    });
  }

  publishReasoningEffect(
    data: Parameters<AgentStreamPublisherService['publishReasoning']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishReasoning(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishReasoning(data: {
    content: string;
    threadId: string;
    runId?: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `reasoning:${data.threadId}:${data.runId ?? 'stream'}`,
      payload: {
        detail: data.content,
        label: 'Reasoning',
        status: 'running',
      },
      runId: data.runId,
      type: 'work.updated',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:reasoning',
    });
  }

  publishToolStartEffect(
    data: Parameters<AgentStreamPublisherService['publishToolStart']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishToolStart(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishToolStart(data: {
    threadId: string;
    detail?: string;
    label?: string;
    parameters: Record<string, unknown>;
    phase?: string;
    progress?: number;
    runId?: string;
    startedAt?: string;
    toolCallId: string;
    toolName: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `tool-start:${data.toolCallId}`,
      payload: {
        detail: data.detail,
        label: data.label,
        parameters: data.parameters,
        phase: data.phase,
        progress: data.progress,
        startedAt: data.startedAt,
        status: 'running',
        toolCallId: data.toolCallId,
        toolName: data.toolName,
      },
      runId: data.runId,
      type: 'tool.started',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:tool_start',
    });
  }

  publishToolCompleteEffect(
    data: Parameters<AgentStreamPublisherService['publishToolComplete']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishToolComplete(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishToolComplete(data: {
    threadId: string;
    creditsUsed: number;
    debug?: StructuredProgressDebugPayload;
    detail?: string;
    durationMs: number;
    estimatedDurationMs?: number;
    error?: string;
    label?: string;
    parameters?: Record<string, unknown>;
    phase?: string;
    progress?: number;
    remainingDurationMs?: number;
    resultSummary?: string;
    runId?: string;
    status: 'completed' | 'failed';
    toolCallId: string;
    toolName: string;
    uiActions?: AgentUiAction[];
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `tool-complete:${data.toolCallId}:${data.status}`,
      payload: {
        creditsUsed: data.creditsUsed,
        debug: data.debug,
        detail: data.detail,
        durationMs: data.durationMs,
        error: data.error,
        estimatedDurationMs: data.estimatedDurationMs,
        label: data.label,
        parameters: data.parameters,
        phase: data.phase,
        progress: data.progress,
        remainingDurationMs: data.remainingDurationMs,
        resultSummary: data.resultSummary,
        status: data.status,
        toolCallId: data.toolCallId,
        toolName: data.toolName,
      },
      runId: data.runId,
      type: 'tool.completed',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:tool_complete',
    });
  }

  publishDoneEffect(
    data: Parameters<AgentStreamPublisherService['publishDone']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishDone(data)).pipe(Effect.asVoid);
  }

  async publishDone(data: {
    threadId: string;
    creditsRemaining: number;
    creditsUsed: number;
    durationMs?: number;
    fullContent: string;
    metadata: Record<string, unknown>;
    runId?: string;
    startedAt?: string;
    toolCalls: Array<{
      creditsUsed: number;
      durationMs: number;
      error?: string;
      status: 'completed' | 'failed';
      toolName: string;
    }>;
    userId: string;
  }) {
    const metadata = data.metadata ?? {};

    await this.persistThreadEvent(data.threadId, {
      commandId: `assistant-final:${data.threadId}:${data.runId ?? 'stream'}`,
      payload: {
        content: data.fullContent,
        memorySummaryRefs:
          Array.isArray(metadata.memorySummaryRefs) &&
          metadata.memorySummaryRefs.every((entry) => typeof entry === 'string')
            ? (metadata.memorySummaryRefs as string[])
            : undefined,
        messageId: `${data.threadId}:${data.runId ?? 'final'}`,
        metadata,
      },
      runId: data.runId,
      type: 'assistant.finalized',
      userId: data.userId,
    });
    await this.persistThreadEvent(data.threadId, {
      commandId: `run-complete:${data.threadId}:${data.runId ?? 'stream'}`,
      payload: {
        detail: 'Agent completed',
        label: 'Agent completed',
        startedAt: data.startedAt,
        status: 'completed',
      },
      runId: data.runId,
      type: 'run.completed',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:done',
    });
  }

  publishErrorEffect(
    data: Parameters<AgentStreamPublisherService['publishError']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishError(data)).pipe(Effect.asVoid);
  }

  async publishError(data: {
    threadId: string;
    error: string;
    runId?: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `run-error:${data.threadId}:${data.runId ?? 'stream'}`,
      payload: {
        error: data.error,
      },
      runId: data.runId,
      type: 'error.raised',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:error',
    });
  }

  publishUIBlocksEffect(
    data: Parameters<AgentStreamPublisherService['publishUIBlocks']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishUIBlocks(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishUIBlocks(data: {
    blockIds?: string[];
    blocks?: AgentUIBlock[];
    threadId: string;
    operation: AgentDashboardOperation;
    runId?: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `ui-blocks:${data.threadId}:${data.runId ?? 'stream'}`,
      payload: {
        blockIds: data.blockIds,
        blocks: data.blocks,
        operation: data.operation,
      },
      runId: data.runId,
      type: 'ui.blocks_updated',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:ui_blocks',
    });
  }

  publishWorkEventEffect(
    data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishWorkEvent(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishWorkEvent(data: {
    threadId: string;
    debug?: StructuredProgressDebugPayload;
    detail?: string;
    estimatedDurationMs?: number;
    event:
      | 'started'
      | 'tool_started'
      | 'tool_completed'
      | 'input_requested'
      | 'input_submitted'
      | 'completed'
      | 'failed'
      | 'cancelled';
    inputRequestId?: string;
    label: string;
    parameters?: Record<string, unknown>;
    phase?: string;
    progress?: number;
    remainingDurationMs?: number;
    resultSummary?: string;
    runId?: string;
    startedAt?: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    toolCallId?: string;
    toolName?: string;
    userId: string;
  }) {
    const mappedType =
      data.event === 'started'
        ? 'work.started'
        : data.event === 'completed'
          ? 'work.completed'
          : data.event === 'failed'
            ? 'run.failed'
            : data.event === 'cancelled'
              ? 'run.cancelled'
              : 'work.updated';

    await this.persistThreadEvent(data.threadId, {
      commandId: `work-event:${data.threadId}:${data.event}:${data.toolCallId ?? data.runId ?? 'stream'}`,
      payload: {
        debug: data.debug,
        detail: data.detail,
        estimatedDurationMs: data.estimatedDurationMs,
        event: data.event,
        inputRequestId: data.inputRequestId,
        label: data.label,
        parameters: data.parameters,
        phase: data.phase,
        progress: data.progress,
        remainingDurationMs: data.remainingDurationMs,
        resultSummary: data.resultSummary,
        startedAt: data.startedAt,
        status: data.status,
        toolCallId: data.toolCallId,
        toolName: data.toolName,
      },
      runId: data.runId,
      type: mappedType,
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:work_event',
    });
  }

  publishInputRequestEffect(
    data: Parameters<AgentStreamPublisherService['publishInputRequest']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishInputRequest(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishInputRequest(data: {
    allowFreeText?: boolean;
    threadId: string;
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
    title: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `input-request:${data.inputRequestId}`,
      payload: {
        allowFreeText: data.allowFreeText,
        fieldId: data.fieldId,
        metadata: data.metadata,
        options: data.options,
        prompt: data.prompt,
        recommendedOptionId: data.recommendedOptionId,
        requestId: data.inputRequestId,
        title: data.title,
      },
      runId: data.runId,
      type: 'input.requested',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:input_request',
    });
  }

  publishInputResolvedEffect(
    data: Parameters<AgentStreamPublisherService['publishInputResolved']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishInputResolved(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishInputResolved(data: {
    answer: string;
    threadId: string;
    inputRequestId: string;
    runId?: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `input-resolved:${data.inputRequestId}`,
      payload: {
        answer: data.answer,
        requestId: data.inputRequestId,
      },
      runId: data.runId,
      type: 'input.resolved',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:input_resolved',
    });
  }

  // ── Agent Run Events ──

  async publishRunStart(data: {
    runId: string;
    organizationId: string;
    userId: string;
    label: string;
    timestamp: string;
  }) {
    await this.redisService.publish(CHANNEL, {
      data,
      type: 'agent:run_start',
    });
  }

  async publishRunProgress(data: {
    runId: string;
    organizationId: string;
    userId: string;
    progress: number;
    toolName?: string;
    timestamp: string;
  }) {
    await this.redisService.publish(CHANNEL, {
      data,
      type: 'agent:run_progress',
    });
  }

  async publishRunComplete(data: {
    runId: string;
    organizationId: string;
    userId: string;
    status: 'completed' | 'failed';
    creditsUsed?: number;
    error?: string;
    timestamp: string;
  }) {
    await this.redisService.publish(CHANNEL, {
      data,
      type: 'agent:run_complete',
    });
  }

  publishToolProgressEffect(
    data: Parameters<AgentStreamPublisherService['publishToolProgress']>[0],
  ): Effect.Effect<void, unknown> {
    return fromPromiseEffect(() => this.publishToolProgress(data)).pipe(
      Effect.asVoid,
    );
  }

  async publishToolProgress(data: {
    threadId: string;
    message: string;
    progress?: number;
    runId?: string;
    toolCallId?: string;
    toolName: string;
    userId: string;
  }) {
    await this.persistThreadEvent(data.threadId, {
      commandId: `tool-progress:${data.toolCallId ?? `${data.toolName}:${data.runId ?? 'stream'}`}`,
      payload: {
        message: data.message,
        progress: data.progress,
        toolCallId: data.toolCallId,
        toolName: data.toolName,
      },
      runId: data.runId,
      type: 'tool.progress',
      userId: data.userId,
    });

    await this.redisService.publish(CHANNEL, {
      data: { ...data, timestamp: new Date().toISOString() },
      type: 'agent:tool_progress',
    });
  }
}
