import { CredentialPlatform } from '@genfeedai/enums';
import type { SocialAnalyticsJobData } from '@genfeedai/queue-contracts';
import { AnalyticsFacebookProcessor } from '@workers/processors/api/queues/analytics-facebook/analytics-facebook.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(
  posts: SocialAnalyticsJobData['posts'],
): Job<SocialAnalyticsJobData> {
  return {
    data: { attemptKey: 'attempt-1', posts },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<SocialAnalyticsJobData>;
}

const post = {
  brandId: 'brand-1',
  credentialId: 'cred-1',
  externalId: 'fb-post-1',
  id: 'post-1',
  organizationId: 'org-1',
  platform: CredentialPlatform.FACEBOOK,
};

describe('AnalyticsFacebookProcessor', () => {
  let processor: AnalyticsFacebookProcessor;
  let credentialsService: { findOne: ReturnType<typeof vi.fn> };
  let facebookService: { getPostAnalytics: ReturnType<typeof vi.fn> };
  let postAnalyticsService: {
    processFacebookAnalytics: ReturnType<typeof vi.fn>;
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
    credentialsService = {
      findOne: vi.fn().mockResolvedValue({ accessToken: 'plain-token' }),
    };
    facebookService = {
      getPostAnalytics: vi.fn().mockResolvedValue({
        comments: 3,
        engagementRate: 0.5,
        impressions: 100,
        likes: 10,
        reach: 90,
        shares: 2,
        views: 120,
      }),
    };
    postAnalyticsService = {
      processFacebookAnalytics: vi.fn().mockResolvedValue(undefined),
    };
    analyticsCollectionState = {
      markFailedTargets: vi.fn().mockResolvedValue(undefined),
      markReadyBatch: vi.fn().mockResolvedValue(undefined),
    };
    postsService = { patch: vi.fn().mockResolvedValue(undefined) };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    processor = new AnalyticsFacebookProcessor(
      credentialsService as never,
      facebookService as never,
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
      'No posts provided for Facebook analytics batch',
    );
    expect(facebookService.getPostAnalytics).not.toHaveBeenCalled();
  });

  it('collects analytics with a credential-scoped tenant query', async () => {
    const job = buildJob([post]);

    await processor.process(job);

    expect(credentialsService.findOne).toHaveBeenCalledWith({
      id: 'cred-1',
      isDeleted: false,
      organizationId: 'org-1',
      platform: CredentialPlatform.FACEBOOK,
    });
    expect(postAnalyticsService.processFacebookAnalytics).toHaveBeenCalledWith(
      'post-1',
      {
        comments: 3,
        engagementRate: 0.5,
        impressions: 100,
        likes: 10,
        reach: 90,
        shares: 2,
        views: 120,
      },
    );
    expect(analyticsCollectionState.markReadyBatch).toHaveBeenCalledWith([
      {
        attemptKey: 'attempt-1',
        brandId: 'brand-1',
        id: 'post-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.FACEBOOK,
      },
    ]);
    expect(analyticsCollectionState.markFailedTargets).not.toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('falls back to a brand-scoped credential lookup without credentialId', async () => {
    const job = buildJob([{ ...post, credentialId: undefined }]);

    await processor.process(job);

    expect(credentialsService.findOne).toHaveBeenCalledWith({
      brandId: 'brand-1',
      isDeleted: false,
      organizationId: 'org-1',
      platform: CredentialPlatform.FACEBOOK,
    });
  });

  it('marks a missing credential as a non-retryable auth failure and disables tracking', async () => {
    credentialsService.findOne.mockResolvedValue(null);
    const job = buildJob([post]);

    await processor.process(job);

    expect(analyticsCollectionState.markFailedTargets).toHaveBeenCalledTimes(1);
    const failedTargets = analyticsCollectionState.markFailedTargets.mock
      .calls[0][0] as Array<{ failure: { isRetryable: boolean } }>;
    expect(failedTargets[0].failure.isRetryable).toBe(false);
    expect(postsService.patch).toHaveBeenCalledWith('post-1', {
      isAnalyticsEnabled: false,
    });
  });

  it('keeps retryable failures enabled for future collection', async () => {
    facebookService.getPostAnalytics.mockRejectedValue(
      Object.assign(new Error('rate limited'), { status: 429 }),
    );
    const job = buildJob([post]);

    await processor.process(job);

    const failedTargets = analyticsCollectionState.markFailedTargets.mock
      .calls[0][0] as Array<{ failure: { isRetryable: boolean } }>;
    expect(failedTargets[0].failure.isRetryable).toBe(true);
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('logs when disabling analytics after a non-retryable failure fails', async () => {
    credentialsService.findOne.mockResolvedValue(null);
    postsService.patch.mockRejectedValue(new Error('patch failed'));
    const job = buildJob([post]);

    await processor.process(job);

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to disable analytics for post post-1',
      expect.any(Error),
    );
  });

  it('rethrows batch-level failures', async () => {
    const job = buildJob([post]);
    analyticsCollectionState.markReadyBatch.mockRejectedValue(
      new Error('state store down'),
    );

    await expect(processor.process(job)).rejects.toThrow('state store down');
  });
});
