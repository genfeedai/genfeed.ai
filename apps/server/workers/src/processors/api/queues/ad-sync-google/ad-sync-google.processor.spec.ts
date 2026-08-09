import type { GoogleAdSyncJobData } from '@genfeedai/queue-contracts';
import { AdSyncGoogleProcessor } from '@workers/processors/api/queues/ad-sync-google/ad-sync-google.processor';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(
  data: Partial<GoogleAdSyncJobData>,
): Job<GoogleAdSyncJobData> {
  return {
    data: {
      accessToken: 'access-token',
      brandId: 'brand-1',
      credentialId: 'cred-1',
      customerIds: ['customer-1'],
      organizationId: 'org-1',
      refreshToken: 'refresh-token',
      ...data,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<GoogleAdSyncJobData>;
}

describe('AdSyncGoogleProcessor', () => {
  let processor: AdSyncGoogleProcessor;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    logger = { error: vi.fn(), log: vi.fn() };
    processor = new AdSyncGoogleProcessor(logger as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs each customer and completes with full progress', async () => {
    const job = buildJob({
      customerIds: ['customer-1', 'customer-2'],
      lastSyncDate: '2026-08-01T00:00:00.000Z',
    });

    const processPromise = processor.process(job);
    await vi.runAllTimersAsync();
    await processPromise;

    expect(job.updateProgress).toHaveBeenCalledWith(50);
    expect(job.updateProgress).toHaveBeenLastCalledWith(100);
    expect(logger.log).toHaveBeenCalledWith(
      'Google Ads sync completed for org org-1',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('defaults the sync window when no lastSyncDate is present', async () => {
    const job = buildJob({ customerIds: [] });

    await processor.process(job);

    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('logs per-customer failures without failing the batch', async () => {
    const job = buildJob({});
    (job.updateProgress as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('progress write failed'))
      .mockResolvedValue(undefined);

    const processPromise = processor.process(job);
    await vi.runAllTimersAsync();
    await processPromise;

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to sync Google customer customer-1',
      'progress write failed',
    );
    expect(job.updateProgress).toHaveBeenLastCalledWith(100);
  });
});
