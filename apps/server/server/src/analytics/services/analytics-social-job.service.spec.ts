import { CredentialPlatform } from '@genfeedai/enums';
import type { ServerAnalyticsCollectionState } from '@genfeedai/interfaces';
import type { SocialAnalyticsJobData } from '@genfeedai/queue-contracts';
import type {
  ServerLogger,
  ServerPostAnalytics,
  ServerPosts,
  ServerSocialAnalytics,
} from '@server/server.dependencies';
import type { AnalyticsQueueJob } from '../analytics-job.types';
import { AnalyticsSocialJobService } from './analytics-social-job.service';

type JobPost = SocialAnalyticsJobData['posts'][number];

interface Harness {
  collectionState: ServerAnalyticsCollectionState;
  logger: ServerLogger;
  postAnalytics: ServerPostAnalytics;
  posts: ServerPosts;
  service: AnalyticsSocialJobService;
  socialAnalytics: ServerSocialAnalytics;
}

function createHarness(): Harness {
  const socialAnalytics = {
    getMediaAnalytics: vi.fn().mockResolvedValue({ views: 42 }),
  } satisfies ServerSocialAnalytics;
  const postAnalytics = {
    processInstagramAnalytics: vi.fn().mockResolvedValue(undefined),
    processLinkedInAnalytics: vi.fn().mockResolvedValue(undefined),
    processMastodonAnalytics: vi.fn().mockResolvedValue(undefined),
    processPinterestAnalytics: vi.fn().mockResolvedValue(undefined),
    processTikTokAnalytics: vi.fn().mockResolvedValue(undefined),
    processTwitterAnalytics: vi.fn().mockResolvedValue(undefined),
    processYouTubeAnalytics: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerPostAnalytics;
  const posts = {
    patch: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerPosts;
  const collectionState = {
    markFailed: vi.fn().mockResolvedValue(undefined),
    markFailedBatch: vi.fn().mockResolvedValue(undefined),
    markFailedTargets: vi.fn().mockResolvedValue(undefined),
    markReady: vi.fn().mockResolvedValue(undefined),
    markReadyBatch: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerAnalyticsCollectionState;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const service = new AnalyticsSocialJobService(
    socialAnalytics,
    socialAnalytics,
    socialAnalytics,
    socialAnalytics,
    socialAnalytics,
    postAnalytics,
    posts,
    collectionState,
    logger,
  );

  return {
    collectionState,
    logger,
    postAnalytics,
    posts,
    service,
    socialAnalytics,
  };
}

function makePost(
  platform: CredentialPlatform,
  overrides: Partial<JobPost> = {},
): JobPost {
  return {
    brandId: 'brand-1',
    externalId: `external-${platform}`,
    id: `post-${platform}`,
    organizationId: 'org-1',
    platform,
    ...overrides,
  };
}

function makeJob(posts: JobPost[]): AnalyticsQueueJob<SocialAnalyticsJobData> {
  return {
    data: {
      attemptKey: 'attempt-1',
      posts,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AnalyticsSocialJobService', () => {
  it('keeps persisted analytics successful when the ready-state write fails', async () => {
    const harness = createHarness();
    const readyError = new Error('ready state write failed');
    vi.mocked(harness.collectionState.markReady).mockRejectedValue(readyError);
    const job = makeJob([
      makePost(CredentialPlatform.INSTAGRAM, {
        externalId: 'ig-1',
        id: 'post-1',
      }),
    ]);

    await harness.service.process(job);

    expect(
      harness.postAnalytics.processInstagramAnalytics,
    ).toHaveBeenCalledWith('post-1', { mediaType: undefined, views: 42 });
    expect(harness.collectionState.markFailed).not.toHaveBeenCalled();
    expect(harness.logger.error).toHaveBeenCalledWith(
      'Failed to mark analytics collection ready for post post-1',
      readyError,
    );
    expect(harness.logger.log).toHaveBeenCalledWith(
      'Instagram analytics completed - 1/1 posts',
    );
  });

  it('warns and stops early on an empty batch', async () => {
    const harness = createHarness();
    const job = makeJob([]);

    await harness.service.process(job);

    expect(harness.logger.warn).toHaveBeenCalledWith(
      'No posts provided for social analytics batch',
    );
    expect(harness.socialAnalytics.getMediaAnalytics).not.toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledTimes(1);
  });

  it('fans a mixed batch out to every platform processor', async () => {
    const harness = createHarness();
    vi.mocked(harness.socialAnalytics.getMediaAnalytics).mockResolvedValue({
      mediaType: 'REELS',
      views: 7,
    });
    const job = makeJob([
      makePost(CredentialPlatform.INSTAGRAM),
      makePost(CredentialPlatform.TIKTOK),
      makePost(CredentialPlatform.PINTEREST),
      makePost(CredentialPlatform.LINKEDIN),
      makePost(CredentialPlatform.MASTODON),
    ]);

    await harness.service.process(job);

    expect(
      harness.postAnalytics.processInstagramAnalytics,
    ).toHaveBeenCalledWith(
      'post-instagram',
      expect.objectContaining({ mediaType: 'reel', views: 7 }),
    );
    expect(harness.postAnalytics.processTikTokAnalytics).toHaveBeenCalledWith(
      'post-tiktok',
      expect.objectContaining({ shares: 0, views: 7 }),
    );
    expect(
      harness.postAnalytics.processPinterestAnalytics,
    ).toHaveBeenCalledWith(
      'post-pinterest',
      expect.objectContaining({ views: 7 }),
    );
    expect(harness.postAnalytics.processLinkedInAnalytics).toHaveBeenCalledWith(
      'post-linkedin',
      expect.objectContaining({ views: 7 }),
    );
    expect(harness.postAnalytics.processMastodonAnalytics).toHaveBeenCalledWith(
      'post-mastodon',
      expect.objectContaining({ views: 7 }),
    );
    expect(harness.collectionState.markReady).toHaveBeenCalledTimes(5);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
    expect(harness.logger.log).toHaveBeenCalledWith(
      'Social media analytics completed - 5 platforms succeeded, 0 failed',
    );
  });

  it('collects multi-post platform batches without sleeping between posts', async () => {
    const harness = createHarness();
    const job = makeJob([
      makePost(CredentialPlatform.TIKTOK, { id: 'post-a' }),
      makePost(CredentialPlatform.TIKTOK, { id: 'post-b' }),
    ]);

    await harness.service.process(job);

    expect(harness.postAnalytics.processTikTokAnalytics).toHaveBeenCalledTimes(
      2,
    );
    expect(harness.collectionState.markReady).toHaveBeenCalledTimes(2);
    expect(harness.logger.log).toHaveBeenCalledWith(
      'TikTok analytics completed - 2/2 posts',
    );
  });

  it('disables analytics tracking after a non-retryable provider failure', async () => {
    const harness = createHarness();
    const authError = { status: 401 };
    vi.mocked(harness.socialAnalytics.getMediaAnalytics).mockRejectedValue(
      authError,
    );
    const job = makeJob([makePost(CredentialPlatform.LINKEDIN)]);

    await harness.service.process(job);

    expect(harness.collectionState.markFailed).toHaveBeenCalledWith(
      {
        attemptKey: 'attempt-1',
        brandId: 'brand-1',
        id: 'post-linkedin',
        organizationId: 'org-1',
        platform: CredentialPlatform.LINKEDIN,
      },
      expect.objectContaining({
        code: 'analytics.authentication_failed',
        isRetryable: false,
      }),
    );
    expect(harness.posts.patch).toHaveBeenCalledWith('post-linkedin', {
      isAnalyticsEnabled: false,
    });
    expect(harness.collectionState.markReady).not.toHaveBeenCalled();
    expect(harness.logger.log).toHaveBeenCalledWith(
      'Disabled analytics tracking for post post-linkedin after a non-retryable failure',
    );
  });

  it('keeps retryable provider failures eligible for the next attempt', async () => {
    const harness = createHarness();
    vi.mocked(harness.socialAnalytics.getMediaAnalytics).mockRejectedValue({
      status: 404,
    });
    const job = makeJob([makePost(CredentialPlatform.PINTEREST)]);

    await harness.service.process(job);

    expect(harness.collectionState.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-pinterest' }),
      expect.objectContaining({
        code: 'analytics.metrics_delayed',
        isRetryable: true,
      }),
    );
    expect(harness.posts.patch).not.toHaveBeenCalled();
  });

  it('logs the disable failure without failing the batch', async () => {
    const harness = createHarness();
    const patchError = new Error('patch failed');
    vi.mocked(harness.socialAnalytics.getMediaAnalytics).mockRejectedValue({
      status: 403,
    });
    vi.mocked(harness.posts.patch).mockRejectedValue(patchError);
    const job = makeJob([makePost(CredentialPlatform.MASTODON)]);

    await harness.service.process(job);

    expect(harness.logger.error).toHaveBeenCalledWith(
      'Failed to disable analytics for post post-mastodon',
      patchError,
    );
    expect(harness.logger.log).toHaveBeenCalledWith(
      'Social media analytics completed - 1 platforms succeeded, 0 failed',
    );
  });

  it('records a rejected platform processor without failing the other platforms', async () => {
    const harness = createHarness();
    const stateError = new Error('state store down');
    vi.mocked(harness.socialAnalytics.getMediaAnalytics).mockRejectedValue({
      status: 500,
    });
    vi.mocked(harness.collectionState.markFailed).mockRejectedValue(stateError);
    const job = makeJob([makePost(CredentialPlatform.TIKTOK)]);

    await harness.service.process(job);

    expect(harness.logger.log).toHaveBeenCalledWith(
      'Social media analytics completed - 0 platforms succeeded, 1 failed',
    );
    expect(harness.logger.error).toHaveBeenCalledWith(
      'Platform 0 analytics failed',
      stateError,
    );
  });

  it('logs and rethrows a batch-level failure', async () => {
    const harness = createHarness();
    const progressError = new Error('progress write failed');
    const job = makeJob([makePost(CredentialPlatform.INSTAGRAM)]);
    vi.mocked(job.updateProgress).mockRejectedValue(progressError);

    await expect(harness.service.process(job)).rejects.toBe(progressError);
    expect(harness.logger.error).toHaveBeenCalledWith(
      'Failed to process social media analytics batch',
      progressError.stack,
    );
  });
});
