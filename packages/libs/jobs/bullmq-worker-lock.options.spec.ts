import {
  BULLMQ_LONG_JOB_LOCK_DURATION_MS,
  BULLMQ_LONG_JOB_LOCK_RENEW_TIME_MS,
  BULLMQ_LONG_JOB_MAX_STALLED_COUNT,
  BULLMQ_LONG_JOB_STALLED_INTERVAL_MS,
  BULLMQ_LONG_JOB_WORKER_OPTIONS,
  withLongJobWorkerOptions,
} from '@libs/jobs/bullmq-worker-lock.options';

describe('bullmq-worker-lock.options', () => {
  it('uses a lease longer than the BullMQ 30s default and keeps stall checks at 30s', () => {
    expect(BULLMQ_LONG_JOB_LOCK_DURATION_MS).toBe(120_000);
    expect(BULLMQ_LONG_JOB_LOCK_RENEW_TIME_MS).toBe(30_000);
    expect(BULLMQ_LONG_JOB_STALLED_INTERVAL_MS).toBe(30_000);
    expect(BULLMQ_LONG_JOB_MAX_STALLED_COUNT).toBe(2);
    expect(BULLMQ_LONG_JOB_LOCK_DURATION_MS).toBeGreaterThan(
      BULLMQ_LONG_JOB_STALLED_INTERVAL_MS,
    );
    expect(BULLMQ_LONG_JOB_WORKER_OPTIONS).toEqual({
      lockDuration: 120_000,
      lockRenewTime: 30_000,
      maxStalledCount: 2,
      stalledInterval: 30_000,
    });
  });

  it('merges caller worker options without dropping lock settings', () => {
    expect(
      withLongJobWorkerOptions({
        concurrency: 3,
        limiter: { duration: 60_000, max: 20 },
      }),
    ).toEqual({
      concurrency: 3,
      limiter: { duration: 60_000, max: 20 },
      lockDuration: 120_000,
      lockRenewTime: 30_000,
      maxStalledCount: 2,
      stalledInterval: 30_000,
    });
  });
});
