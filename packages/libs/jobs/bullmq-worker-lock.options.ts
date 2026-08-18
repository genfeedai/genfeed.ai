/**
 * BullMQ worker lock defaults for multi-minute processors.
 *
 * Library defaults are lockDuration=30s, stalledInterval=30s, maxStalledCount=1.
 * Long jobs (agent-run, workflow execution, clip/video pipelines, generation)
 * routinely exceed 30s. Locks renew while the event loop is healthy; a 30s
 * lease still stalls when renewal is delayed by event-loop pressure or a brief
 * Redis blip. A 2-minute lease plus maxStalledCount=2 absorbs one deploy-time
 * stall without hiding a dead worker (stalledInterval stays 30s).
 */
export const BULLMQ_LONG_JOB_LOCK_DURATION_MS = 120_000;
export const BULLMQ_LONG_JOB_LOCK_RENEW_TIME_MS = 30_000;
export const BULLMQ_LONG_JOB_MAX_STALLED_COUNT = 2;
export const BULLMQ_LONG_JOB_STALLED_INTERVAL_MS = 30_000;

export const BULLMQ_LONG_JOB_WORKER_OPTIONS = {
  lockDuration: BULLMQ_LONG_JOB_LOCK_DURATION_MS,
  lockRenewTime: BULLMQ_LONG_JOB_LOCK_RENEW_TIME_MS,
  maxStalledCount: BULLMQ_LONG_JOB_MAX_STALLED_COUNT,
  stalledInterval: BULLMQ_LONG_JOB_STALLED_INTERVAL_MS,
} as const;

export function withLongJobWorkerOptions<T extends object>(
  options: T,
): T & typeof BULLMQ_LONG_JOB_WORKER_OPTIONS {
  return {
    ...BULLMQ_LONG_JOB_WORKER_OPTIONS,
    ...options,
  };
}
