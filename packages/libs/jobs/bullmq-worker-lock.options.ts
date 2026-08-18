/**
 * BullMQ worker lock defaults for multi-minute processors.
 *
 * Library defaults are lockDuration=30s, stalledInterval=30s, maxStalledCount=1.
 * Long workers-service jobs (agent-run, workflow execution, clip/generation)
 * routinely exceed 30s. Locks renew while the event loop is healthy; a 30s
 * lease still stalls when renewal is delayed by event-loop pressure or a brief
 * Redis blip. A 2-minute lease covers that gap without hiding a dead worker
 * (stalledInterval stays 30s).
 *
 * maxStalledCount is omitted on purpose. Raising it above BullMQ's default of
 * 1 lets a side-effecting job (article gen, credits, webhooks) run a third
 * time after two stalls. Deploy-time stalls stay a drain / stop-timeout fix.
 *
 * Do not apply this preset on the files service. `setupGracefulShutdown()`
 * still `process.exit(0)` on SIGTERM, so a longer lock does not drain or
 * extend leases there.
 */
export const BULLMQ_LONG_JOB_LOCK_DURATION_MS = 120_000;
export const BULLMQ_LONG_JOB_LOCK_RENEW_TIME_MS = 30_000;
export const BULLMQ_LONG_JOB_STALLED_INTERVAL_MS = 30_000;

export const BULLMQ_LONG_JOB_WORKER_OPTIONS = {
  lockDuration: BULLMQ_LONG_JOB_LOCK_DURATION_MS,
  lockRenewTime: BULLMQ_LONG_JOB_LOCK_RENEW_TIME_MS,
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
