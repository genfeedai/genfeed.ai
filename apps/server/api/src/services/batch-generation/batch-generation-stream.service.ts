import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import type { BatchProcessOptions } from '@api/services/batch-generation/batch-generation.types';
import { AgentToolName } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/** Identity a batch run needs to stream progress back into its agent thread. */
export type BatchStreamContext = {
  batchId: string;
  runId?: string;
  threadId: string;
  userId: string;
};

/**
 * Builds the agent-thread progress callbacks for a batch run.
 *
 * Extracted from the media-generation tool handler because the run itself
 * moved: batches now execute in the workers process, so the callbacks have to
 * be reconstructible from job data rather than closed over the request that
 * started them. `AgentStreamPublisherService` publishes over Redis pub/sub, so
 * the events reach the user's open thread from either process.
 */
@Injectable()
export class BatchGenerationStreamService {
  constructor(
    private readonly logger: LoggerService,
    @Optional()
    private readonly streamPublisher?: AgentStreamPublisherService,
  ) {}

  /**
   * Progress callbacks for one batch run, or `undefined` when the batch has no
   * thread to stream into (or no publisher wired, as in OSS single-process
   * builds) — `processBatch` treats missing callbacks as "run silently".
   */
  buildProcessOptions(
    context: BatchStreamContext,
  ): BatchProcessOptions | undefined {
    const publisher = this.streamPublisher;
    if (!publisher) {
      return undefined;
    }

    const { batchId, runId, threadId, userId } = context;

    // A stream failure must never take down the batch: the drafts are the
    // product, the progress feed is decoration.
    const publish = async (
      data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
    ): Promise<void> => {
      try {
        await publisher.publishWorkEvent(data);
      } catch (error: unknown) {
        this.logger.warn(`Batch ${batchId} progress event dropped`, {
          batchId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const percent = (done: number, total: number): number =>
      Math.round((done / Math.max(total, 1)) * 100);

    return {
      onBatchStarted: ({ totalCount }) =>
        publish({
          detail: `Queued ${totalCount} post${totalCount === 1 ? '' : 's'} for generation.`,
          event: 'started',
          label: 'Batch generation started',
          progress: 0,
          runId,
          startedAt: new Date().toISOString(),
          status: 'running',
          threadId,
          toolCallId: `batch:${batchId}`,
          toolName: AgentToolName.GENERATE_CONTENT_BATCH,
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
            batchId,
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
          toolCallId: `batch:${batchId}:item:${String(item.id)}`,
          toolName: AgentToolName.GENERATE_CONTENT_BATCH,
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
          parameters: { batchId, platform: item.platform, topic },
          progress: percent(completedCount + failedCount, totalCount),
          resultSummary: error || 'Unknown error',
          runId,
          status: 'failed',
          threadId,
          toolCallId: `batch:${batchId}:item:${String(item.id)}`,
          toolName: AgentToolName.GENERATE_CONTENT_BATCH,
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
          parameters: { batchId, format: item.format, platform: item.platform },
          progress: percent(completedCount + failedCount, totalCount),
          runId,
          status: 'running',
          threadId,
          toolCallId: `batch:${batchId}:item:${String(item.id)}`,
          toolName: AgentToolName.GENERATE_CONTENT_BATCH,
          userId,
        }),
    };
  }
}
