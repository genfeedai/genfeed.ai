import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import {
  fromPromiseEffect,
  runEffectPromise,
} from '@api/helpers/utils/effect/effect.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import {
  AgentThreadEngineService,
  type AppendAgentThreadEventParams,
} from '@api/services/agent-threading/services/agent-thread-engine.service';
import type {
  AgentDashboardOperation,
  AgentUIBlock,
  AgentUiAction,
} from '@genfeedai/interfaces';
import type { StructuredProgressDebugPayload } from '@genfeedai/utils/server';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

const CHANNEL = 'agent-chat';

// #2517 defaults — mirrored by AGENT_STREAM_COALESCE_WINDOW_MS /
// AGENT_STREAM_COALESCE_MAX_BYTES in packages/config/src/schemas/ai.schema.ts.
// Kept here only as a last-resort fallback if ConfigService is unavailable
// (e.g. constructed outside DI in a test).
const DEFAULT_COALESCE_WINDOW_MS = 50;
const DEFAULT_COALESCE_MAX_BYTES = 2048;

/**
 * A run's buffered-but-not-yet-published live token deltas. Deltas are no
 * longer persisted per-token (#2517 item 1 — `assistant.finalized` is the
 * durable record); this buffer exists purely to coalesce the live transport
 * fan-out so a fast-streaming LLM response collapses from one Redis publish
 * + socket.io emit per token into a handful of publishes per response.
 *
 * `threadId`/`runId`/`userId` are captured once, from the first token of the
 * run, and reused for every flush of that key — the thread and caller cannot
 * change mid-run, so re-validating per token is wasted work on the hot path.
 */
interface PendingTokenBuffer {
  bytes: number;
  runId?: string;
  threadId: string;
  timer?: ReturnType<typeof setTimeout>;
  tokens: string[];
  userId: string;
}

@Injectable()
export class AgentStreamPublisherService {
  private readonly constructorName = String(this.constructor.name);
  private readonly pendingTokenBuffers = new Map<string, PendingTokenBuffer>();

  constructor(
    private readonly redisService: RedisService,
    private readonly loggerService: LoggerService,
    @Optional()
    private readonly agentThreadsService?: AgentThreadsService,
    @Optional()
    private readonly agentThreadEngineService?: AgentThreadEngineService,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  private getCoalesceWindowMs(): number {
    return (
      Number(this.configService?.get('AGENT_STREAM_COALESCE_WINDOW_MS')) ||
      DEFAULT_COALESCE_WINDOW_MS
    );
  }

  private getCoalesceMaxBytes(): number {
    return (
      Number(this.configService?.get('AGENT_STREAM_COALESCE_MAX_BYTES')) ||
      DEFAULT_COALESCE_MAX_BYTES
    );
  }

  private tokenBufferKey(threadId: string, runId?: string): string {
    return `${threadId}:${runId ?? 'stream'}`;
  }

  /**
   * Pop and clear the pending buffer for `key`, returning a ready-to-publish
   * Redis batch entry (or `null` if there was nothing buffered). Clears any
   * armed flush timer so a stale timer can never fire against an
   * already-flushed / already-deleted buffer entry.
   */
  private buildFlushEntry(
    key: string,
  ): { channel: string; message: unknown } | null {
    const pending = this.pendingTokenBuffers.get(key);
    if (!pending) {
      return null;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.pendingTokenBuffers.delete(key);

    if (pending.tokens.length === 0) {
      return null;
    }

    return {
      channel: CHANNEL,
      message: {
        data: {
          runId: pending.runId,
          threadId: pending.threadId,
          token: pending.tokens.join(''),
          timestamp: new Date().toISOString(),
          userId: pending.userId,
        },
        type: 'agent:token',
      },
    };
  }

  /**
   * Timer-triggered flush. Runs outside any caller's awaited chain (it's
   * scheduled via `setTimeout`), so unlike the byte-threshold flush inside
   * `publishToken` — whose promise is awaited and errors bubble to the
   * caller's own `Effect.catchAll` — this path must swallow and log its own
   * errors or it becomes an unhandled promise rejection.
   */
  private flushTokenBufferOnTimer(key: string): void {
    const entry = this.buildFlushEntry(key);
    if (!entry) {
      return;
    }
    this.redisService.publish(entry.channel, entry.message).catch((error) => {
      this.loggerService.warn(
        `${this.constructorName} coalesced token flush failed for ${key}`,
        { error: error instanceof Error ? error.message : String(error) },
      );
    });
  }

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
      if (!EntityIdUtil.isValid(threadId)) {
        return;
      }

      const thread = await this.agentThreadsService.findOne({
        id: threadId,
      });

      const organizationId = thread?.organizationId;

      if (!organizationId) {
        return;
      }

      await runEffectPromise(
        this.appendThreadEventEffect({
          commandId: params.commandId,
          metadata: { origin: 'stream-publisher' },
          organizationId,
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

  /**
   * Live-transport only (#2517 item 1) — token deltas are no longer persisted
   * as `assistant.delta` thread events. `assistant.finalized` (written once,
   * in `publishDone`) is the durable record; deltas exist solely to drive the
   * live UI. `'assistant.delta'` remains a valid `persistThreadEvent` type
   * and thread-timeline branch for historical rows written before this
   * change, and for the CLI's independent event-type vocabulary — only the
   * write here was removed.
   *
   * Deltas are buffered per run (#2517 item 2) and flushed as one Redis
   * publish when the coalescing window elapses or the byte threshold is hit,
   * whichever is first — collapsing what would otherwise be one Redis
   * publish + socket.io emit per LLM token into a handful per response.
   */
  async publishToken(data: {
    threadId: string;
    runId?: string;
    token: string;
    userId: string;
  }): Promise<void> {
    const key = this.tokenBufferKey(data.threadId, data.runId);
    let pending = this.pendingTokenBuffers.get(key);
    if (!pending) {
      pending = {
        bytes: 0,
        runId: data.runId,
        threadId: data.threadId,
        tokens: [],
        userId: data.userId,
      };
      this.pendingTokenBuffers.set(key, pending);
    }

    pending.tokens.push(data.token);
    pending.bytes += Buffer.byteLength(data.token, 'utf8');

    if (pending.bytes >= this.getCoalesceMaxBytes()) {
      const entry = this.buildFlushEntry(key);
      if (entry) {
        await this.redisService.publish(entry.channel, entry.message);
      }
      return;
    }

    if (!pending.timer) {
      pending.timer = setTimeout(() => {
        this.flushTokenBufferOnTimer(key);
      }, this.getCoalesceWindowMs());
      pending.timer.unref?.();
    }
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
    threadTitle?: string;
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

    // Force-flush any buffered-but-unpublished token deltas synchronously so
    // no trailing text is lost when the run ends (#2517 item 2), and pipeline
    // it with the `agent:done` publish instead of awaiting each sequentially
    // (#2517 item 3). ioredis pipelines preserve command order, so the
    // trailing tokens are guaranteed to arrive before `agent:done`.
    const flushEntry = this.buildFlushEntry(
      this.tokenBufferKey(data.threadId, data.runId),
    );
    const doneEntry = {
      channel: CHANNEL,
      message: {
        data: { ...data, timestamp: new Date().toISOString() },
        type: 'agent:done',
      },
    };

    await this.redisService.publishBatch(
      flushEntry ? [flushEntry, doneEntry] : [doneEntry],
    );
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

    // Both failure and cancellation route through here (see
    // publishStreamCancelledEffect/publishStreamFailureEffect) — force-flush
    // any buffered token deltas so partial text isn't silently dropped right
    // before the error surfaces, and so the buffer's Map entry never leaks.
    const flushEntry = this.buildFlushEntry(
      this.tokenBufferKey(data.threadId, data.runId),
    );
    const errorEntry = {
      channel: CHANNEL,
      message: {
        data: { ...data, timestamp: new Date().toISOString() },
        type: 'agent:error',
      },
    };

    await this.redisService.publishBatch(
      flushEntry ? [flushEntry, errorEntry] : [errorEntry],
    );
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
