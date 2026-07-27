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

describe('AnalyticsSocialJobService', () => {
  it('keeps persisted analytics successful when the ready-state write fails', async () => {
    const socialAnalytics = {
      getMediaAnalytics: vi.fn().mockResolvedValue({ views: 42 }),
    } satisfies ServerSocialAnalytics;
    const postAnalytics = {
      processInstagramAnalytics: vi.fn().mockResolvedValue(undefined),
      processLinkedInAnalytics: vi.fn(),
      processMastodonAnalytics: vi.fn(),
      processPinterestAnalytics: vi.fn(),
      processTikTokAnalytics: vi.fn(),
      processTwitterAnalytics: vi.fn(),
      processYouTubeAnalytics: vi.fn(),
    } satisfies ServerPostAnalytics;
    const posts = {
      patch: vi.fn().mockResolvedValue(undefined),
    } satisfies ServerPosts;
    const readyError = new Error('ready state write failed');
    const collectionState = {
      markFailed: vi.fn().mockResolvedValue(undefined),
      markReady: vi.fn().mockRejectedValue(readyError),
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
    const job = {
      data: {
        attemptKey: 'attempt-1',
        posts: [
          {
            brand: 'brand-1',
            externalId: 'ig-1',
            id: 'post-1',
            organization: 'org-1',
            platform: CredentialPlatform.INSTAGRAM,
          },
        ],
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } satisfies AnalyticsQueueJob<SocialAnalyticsJobData>;

    await service.process(job);

    expect(postAnalytics.processInstagramAnalytics).toHaveBeenCalledWith(
      'post-1',
      { mediaType: undefined, views: 42 },
    );
    expect(collectionState.markFailed).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to mark analytics collection ready for post post-1',
      readyError,
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Instagram analytics completed - 1/1 posts',
    );
  });
});
