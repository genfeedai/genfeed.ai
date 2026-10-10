import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import type { TurboRunProcessOptions } from '@api/services/turbo-run/turbo-run.types';

import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/** Identity a run run needs to stream progress back into its agent thread. */
export type TurboRunStreamContext = {
  turboRunId: string;
  runId?: string;
  threadId: string;
  userId: string;
};

/**
 * Builds the agent-thread progress callbacks for a run run.
 *
 * Extracted from the media-generation tool handler because the run itself
 * moved: runs now execute in the workers process, so the callbacks have to
 * be reconstructible from job data rather than closed over the request that
 * started them. `AgentStreamPublisherService` publishes over Redis pub/sub, so
 * the events reach the user's open thread from either process.
 */
@Injectable()
export class TurboRunStreamService {
  constructor(
    private readonly logger: LoggerService,
    @Optional()
    private readonly streamPublisher?: AgentStreamPublisherService,
  ) {}

  /**
   * Progress callbacks for one run run, or `undefined` when the run has no
   * thread to stream into (or no publisher wired, as in OSS single-process
   * builds) — `processTurboRun` treats missing callbacks as "run silently".
   */
  buildProcessOptions(
    context: TurboRunStreamContext,
  ): TurboRunProcessOptions | undefined {
    const publisher = this.streamPublisher;
    if (!publisher) {
      return undefined;
    }

    const { turboRunId, runId, threadId, userId } = context;

    // A stream failure must never take down the run: the drafts are the
    // product, the progress feed is decoration.
    const publish = async (
      data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
    ): Promise<void> => {
      try {
        await publisher.publishWorkEvent(data);
      } catch (error: unknown) {
        this.logger.warn(`Batch ${turboRunId} progress event dropped`, {
          turboRunId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const percent = (done: number, total: number): number =>
      Math.round((done / Math.max(total, 1)) * 100);

    return {
      onTurboRunStarted: ({ totalCount }) =>
        publish({
          detail: `Queued ${totalCount} post${totalCount === 1 ? '' : 's'} for generation.`,
          event: 'started',
          label: 'Turbo run started',
          progress: 0,
          runId,
          startedAt: new Date().toISOString(),
          status: 'running',
          threadId,
          toolCallId: `batch:${turboRunId}`,
          toolName: 'generate_turbo_content',
          userId,
        }),

      onItemCompleted: ({
        completedCount,
        index,
        item,
        postId,
        previewText,
        topic,
        totalCount,
      }) =>
        publish({
          detail: `Draft ${completedCount}/${totalCount} is ready.`,
          event: 'tool_completed',
          label: `Generated post ${index + 1}`,
          parameters: {
            turboRunId,
            platform: item.platform,
            postId,
            previewText,
            topic,
          },
          progress: percent(completedCount, totalCount),
          resultSummary: previewText || topic,
          runId,
          status: 'completed',
          threadId,
          toolCallId: `batch:${turboRunId}:item:${String(item.id)}`,
          toolName: 'generate_turbo_content',
          userId,
        }),

      onItemFailed: ({
        completedCount,
        error,
        failedCount,
        index,
        item,
        topic,
        totalCount,
      }) =>
        publish({
          detail: error || 'Draft generation failed.',
          event: 'tool_completed',
          label: `Failed post ${index + 1}`,
          parameters: { turboRunId, platform: item.platform, topic },
          progress: percent(completedCount + failedCount, totalCount),
          resultSummary: error || 'Unknown error',
          runId,
          status: 'failed',
          threadId,
          toolCallId: `batch:${turboRunId}:item:${String(item.id)}`,
          toolName: 'generate_turbo_content',
          userId,
        }),

      onItemStarted: ({
        completedCount,
        failedCount,
        index,
        item,
        totalCount,
      }) =>
        publish({
          detail: `Generating draft ${index + 1}/${totalCount}.`,
          event: 'tool_started',
          label: `Generating post ${index + 1}`,
          parameters: { turboRunId, format: item.format, platform: item.platform },
          progress: percent(completedCount + failedCount, totalCount),
          runId,
          status: 'running',
          threadId,
          toolCallId: `batch:${turboRunId}:item:${String(item.id)}`,
          toolName: 'generate_turbo_content',
          userId,
        }),
    };
  }
}
