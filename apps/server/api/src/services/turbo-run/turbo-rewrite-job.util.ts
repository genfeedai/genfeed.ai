import {
  TurboRewriteItemFailureReason,
  TurboRewriteJobStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  ITurboRewriteItemFailure,
  ITurboRewriteJob,
  ITurboRewriteJobProgress,
} from '@genfeedai/contracts/interfaces';
import type {
  TurboRewriteJobData,
  TurboRewriteJobResult,
} from '@genfeedai/contracts/queue';
import type { Job, JobState } from 'bullmq';

export type TurboRewriteJob = Job<TurboRewriteJobData, TurboRewriteJobResult>;

export const TURBO_REWRITE_TASK_LABEL = 'Turbo rewrite';

/** Posts past review keep their caption: a rewrite would edit shipped content. */
export const NON_REWRITABLE_POST_STATES: ReadonlySet<string> = new Set([
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.SKIPPED,
  TargetExecutionState.CANCELLED,
]);

/** One live rewrite per run: BullMQ keeps this key until the job settles. */
export function turboRewriteDeduplicationId(turboRunId: string): string {
  return `turbo-rewrite-${turboRunId}`;
}

const FAILURE_REASONS: ReadonlySet<string> = new Set(
  Object.values(TurboRewriteItemFailureReason),
);

function isItemFailure(value: unknown): value is ITurboRewriteItemFailure {
  if (!value || typeof value !== 'object') return false;
  const failure = value as Record<string, unknown>;
  return (
    typeof failure.itemId === 'string' &&
    typeof failure.reason === 'string' &&
    FAILURE_REASONS.has(failure.reason)
  );
}

/** Reads the per-item progress BullMQ stores as untyped job progress. */
export function readTurboRewriteProgress(
  value: unknown,
): ITurboRewriteJobProgress {
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
  progress: ITurboRewriteJobProgress,
  isCancelled: boolean,
): TurboRewriteJobStatus {
  if (isCancelled) return TurboRewriteJobStatus.CANCELLED;
  if (progress.failedItems.length === 0) return TurboRewriteJobStatus.COMPLETED;
  return progress.completedItemIds.length > 0
    ? TurboRewriteJobStatus.PARTIALLY_FAILED
    : TurboRewriteJobStatus.FAILED;
}

function resolveJobStatus(
  state: JobState | 'unknown',
  result: TurboRewriteJobResult | undefined,
): TurboRewriteJobStatus {
  if (state === 'completed') {
    return result?.status ?? TurboRewriteJobStatus.COMPLETED;
  }
  if (state === 'failed') return TurboRewriteJobStatus.FAILED;
  if (state === 'active') return TurboRewriteJobStatus.PROCESSING;
  return TurboRewriteJobStatus.QUEUED;
}

export function isTerminalRewriteStatus(
  status: TurboRewriteJobStatus,
): boolean {
  return (
    status !== TurboRewriteJobStatus.QUEUED &&
    status !== TurboRewriteJobStatus.PROCESSING
  );
}

export async function toTurboRewriteJob(
  job: TurboRewriteJob,
): Promise<ITurboRewriteJob> {
  const state = await job.getState();
  return {
    ...readTurboRewriteProgress(job.returnvalue ?? job.progress),
    turboRunId: job.data.turboRunId,
    id: job.id ?? '',
    isCancelRequested: job.data.isCancelRequested === true,
    itemIds: job.data.itemIds,
    status: resolveJobStatus(state, job.returnvalue ?? undefined),
  };
}
