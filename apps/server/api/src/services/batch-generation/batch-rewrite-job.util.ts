import {
  BatchRewriteItemFailureReason,
  BatchRewriteJobStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IBatchRewriteItemFailure,
  IBatchRewriteJob,
  IBatchRewriteJobProgress,
} from '@genfeedai/contracts/interfaces';
import type {
  BatchRewriteJobData,
  BatchRewriteJobResult,
} from '@genfeedai/contracts/queue';
import type { Job, JobState } from 'bullmq';

export type BatchRewriteJob = Job<BatchRewriteJobData, BatchRewriteJobResult>;

export const BATCH_REWRITE_TASK_LABEL = 'Batch rewrite';

/** Posts past review keep their caption: a rewrite would edit shipped content. */
export const NON_REWRITABLE_POST_STATES: ReadonlySet<string> = new Set([
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.SKIPPED,
  TargetExecutionState.CANCELLED,
]);

/** One live rewrite per batch: BullMQ keeps this key until the job settles. */
export function batchRewriteDeduplicationId(batchId: string): string {
  return `batch-rewrite-${batchId}`;
}

const FAILURE_REASONS: ReadonlySet<string> = new Set(
  Object.values(BatchRewriteItemFailureReason),
);

function isItemFailure(value: unknown): value is IBatchRewriteItemFailure {
  if (!value || typeof value !== 'object') return false;
  const failure = value as Record<string, unknown>;
  return (
    typeof failure.itemId === 'string' &&
    typeof failure.reason === 'string' &&
    FAILURE_REASONS.has(failure.reason)
  );
}

/** Reads the per-item progress BullMQ stores as untyped job progress. */
export function readBatchRewriteProgress(
  value: unknown,
): IBatchRewriteJobProgress {
  if (!value || typeof value !== 'object') {
    return { completedItemIds: [], failedItems: [] };
  }
  const progress = value as Record<string, unknown>;
  return {
    completedItemIds: Array.isArray(progress.completedItemIds)
      ? progress.completedItemIds.filter(
          (itemId): itemId is string => typeof itemId === 'string',
        )
      : [],
    failedItems: Array.isArray(progress.failedItems)
      ? progress.failedItems.filter(isItemFailure)
      : [],
  };
}

export function resolveFinalRewriteStatus(
  progress: IBatchRewriteJobProgress,
  isCancelled: boolean,
): BatchRewriteJobStatus {
  if (isCancelled) return BatchRewriteJobStatus.CANCELLED;
  if (progress.failedItems.length === 0) return BatchRewriteJobStatus.COMPLETED;
  return progress.completedItemIds.length > 0
    ? BatchRewriteJobStatus.PARTIALLY_FAILED
    : BatchRewriteJobStatus.FAILED;
}

function resolveJobStatus(
  state: JobState | 'unknown',
  result: BatchRewriteJobResult | undefined,
): BatchRewriteJobStatus {
  if (state === 'completed') {
    return result?.status ?? BatchRewriteJobStatus.COMPLETED;
  }
  if (state === 'failed') return BatchRewriteJobStatus.FAILED;
  if (state === 'active') return BatchRewriteJobStatus.PROCESSING;
  return BatchRewriteJobStatus.QUEUED;
}

export function isTerminalRewriteStatus(
  status: BatchRewriteJobStatus,
): boolean {
  return (
    status !== BatchRewriteJobStatus.QUEUED &&
    status !== BatchRewriteJobStatus.PROCESSING
  );
}

export async function toBatchRewriteJob(
  job: BatchRewriteJob,
): Promise<IBatchRewriteJob> {
  const state = await job.getState();
  return {
    ...readBatchRewriteProgress(job.returnvalue ?? job.progress),
    batchId: job.data.batchId,
    id: job.id ?? '',
    isCancelRequested: job.data.isCancelRequested === true,
    itemIds: job.data.itemIds,
    status: resolveJobStatus(state, job.returnvalue ?? undefined),
  };
}
