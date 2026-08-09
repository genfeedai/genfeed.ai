import { CredentialPlatform } from '@genfeedai/enums';
import type { SocialAnalyticsJobData } from '@genfeedai/queue-contracts';
import { AnalyticsThreadsProcessor } from '@workers/processors/api/queues/analytics-threads/analytics-threads.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(
  posts: SocialAnalyticsJobData['posts'],
): Job<SocialAnalyticsJobData> {
  return {
    data: { attemptKey: 'attempt-9', posts },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SocialAnalyticsJobData>;
}

const post = {
  brandId: 'brand-1',
  credentialId: 'cred-1',
  externalId: 'thread-1',
  id: 'post-1',
  organizationId: 'org-1',
  platform: CredentialPlatform.THREADS,
};

describe('AnalyticsThreadsProcessor', () => {
  let processor: AnalyticsThreadsProcessor;
  let threadsService: { getThreadInsights: ReturnType<typeof vi.fn> };
  let postAnalyticsService: {
    processThreadsAnalytics: ReturnType<typeof vi.fn>;
  };
  let analyticsCollectionState: {
    markFailedTargets: ReturnType<typeof vi.fn>;
    markReadyBatch: ReturnType<typeof vi.fn>;
  };
  let postsService: { patch: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    threadsService = {
      getThreadInsights: vi.fn().mockResolvedValue({ likes: 5, views: 50 }),
    };
    postAnalyticsService = {
      processThreadsAnalytics: vi.fn().mockResolvedValue(undefined),
    };
    analyticsCollectionState = {
      markFailedTargets: vi.fn().mockResolvedValue(undefined),
      markReadyBatch: vi.fn().mockResolvedValue(undefined),
    };
    postsService = { patch: vi.fn().mockResolvedValue(undefined) };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    processor = new AnalyticsThreadsProcessor(
      threadsService as never,
      postAnalyticsService as never,
      analyticsCollectionState as never,
      postsService as never,
      logger as never,
    );
  });

  it('returns early when the batch has no posts', async () => {
    const job = buildJob([]);

    await processor.process(job);

    expect(logger.warn).toHaveBeenCalledWith(
      'No posts provided for Threads analytics batch',
    );
    expect(threadsService.getThreadInsights).not.toHaveBeenCalled();
  });

  it('collects insights and marks targets ready', async () => {
    const job = buildJob([post]);

    await processor.process(job);

    expect(threadsService.getThreadInsights).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'thread-1',
      'cred-1',
    );
    expect(postAnalyticsService.processThreadsAnalytics).toHaveBeenCalledWith(
      'post-1',
      { likes: 5, views: 50 },
    );
    expect(analyticsCollectionState.markReadyBatch).toHaveBeenCalledWith([
      {
        attemptKey: 'attempt-9',
        brandId: 'brand-1',
        id: 'post-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.THREADS,
      },
    ]);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('disables analytics tracking on a non-retryable auth failure', async () => {
    threadsService.getThreadInsights.mockRejectedValue(
      Object.assign(new Error('unauthorized'), { status: 401 }),
    );
    const job = buildJob([post]);

    await processor.process(job);

    const failedTargets = analyticsCollectionState.markFailedTargets.mock
      .calls[0][0] as Array<{ failure: { isRetryable: boolean } }>;
    expect(failedTargets[0].failure.isRetryable).toBe(false);
    expect(postsService.patch).toHaveBeenCalledWith('post-1', {
      isAnalyticsEnabled: false,
    });
  });

  it('keeps retryable failures enabled and logs the patch failure path', async () => {
    threadsService.getThreadInsights
      .mockRejectedValueOnce(
        Object.assign(new Error('delayed'), { status: 404 }),
      )
      .mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 400 }));
    postsService.patch.mockRejectedValue(new Error('patch failed'));
    const job = buildJob([post, { ...post, id: 'post-2' }]);

    await processor.process(job);

    const failedTargets = analyticsCollectionState.markFailedTargets.mock
      .calls[0][0] as Array<{ failure: { isRetryable: boolean }; id: string }>;
    expect(failedTargets).toHaveLength(2);
    expect(failedTargets[0].failure.isRetryable).toBe(true);
    expect(failedTargets[1].failure.isRetryable).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to disable analytics for post post-2',
      expect.any(Error),
    );
  });

  it('rethrows batch-level failures', async () => {
    analyticsCollectionState.markReadyBatch.mockRejectedValue(
      new Error('state store down'),
    );

    await expect(processor.process(buildJob([post]))).rejects.toThrow(
      'state store down',
    );
  });
});
