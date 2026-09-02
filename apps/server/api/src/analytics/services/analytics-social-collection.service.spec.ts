import type { SocialAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import type {
  ServerLogger,
  ServerPostAnalytics,
  ServerPosts,
  ServerSocialAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/enums';
import type { ServerAnalyticsCollectionState } from '@genfeedai/interfaces';
import { AnalyticsSocialCollectionService } from './analytics-social-collection.service';

function createHarness() {
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
  const service = new AnalyticsSocialCollectionService(
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
  return { collectionState, postAnalytics, posts, service, socialAnalytics };
}

function input(
  platform = CredentialPlatform.INSTAGRAM,
): SocialAnalyticsCollectionInput {
  return {
    attemptKey: 'attempt-1',
    posts: [
      {
        brandId: 'brand-1',
        externalId: 'external-1',
        id: 'post-1',
        organizationId: 'org-1',
        platform,
      },
    ],
  };
}

describe('AnalyticsSocialCollectionService', () => {
  it('collects and finalizes exactly one action item', async () => {
    const harness = createHarness();

    await harness.service.collect(input());

    expect(
      harness.postAnalytics.processInstagramAnalytics,
    ).toHaveBeenCalledWith('post-1', { mediaType: undefined, views: 42 });
    expect(harness.collectionState.markReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1', organizationId: 'org-1' }),
    );
  });

  it('records collection state and rethrows provider failures', async () => {
    const harness = createHarness();
    const error = Object.assign(new Error('credential rejected'), {
      status: 401,
    });
    vi.mocked(harness.socialAnalytics.getMediaAnalytics).mockRejectedValue(
      error,
    );

    await expect(harness.service.collect(input())).rejects.toBe(error);

    expect(harness.collectionState.markFailed).toHaveBeenCalled();
    expect(harness.posts.patch).toHaveBeenCalledWith('post-1', {
      isAnalyticsEnabled: false,
    });
  });

  it('rejects batch-shaped inputs at the action boundary', async () => {
    const harness = createHarness();
    const batch = input();
    const post = batch.posts[0];
    if (!post) {
      throw new Error('test fixture requires a post');
    }
    batch.posts.push({ ...post, id: 'post-2' });

    await expect(harness.service.collect(batch)).rejects.toThrow(
      'requires exactly one post',
    );
  });
});
