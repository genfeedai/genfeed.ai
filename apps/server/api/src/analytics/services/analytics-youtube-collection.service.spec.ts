import type { YouTubeAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import type {
  ServerCredentialStore,
  ServerLogger,
  ServerPostAnalytics,
  ServerYouTubeAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { ServerAnalyticsCollectionState } from '@genfeedai/contracts/interfaces';
import { AnalyticsYouTubeCollectionService } from './analytics-youtube-collection.service';

function createHarness(analytics = new Map<string, unknown>()) {
  const collectionState = {
    markFailed: vi.fn().mockResolvedValue(undefined),
    markFailedBatch: vi.fn().mockResolvedValue(undefined),
    markFailedTargets: vi.fn().mockResolvedValue(undefined),
    markReady: vi.fn().mockResolvedValue(undefined),
    markReadyBatch: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerAnalyticsCollectionState;
  const postAnalytics = {
    processYouTubeAnalytics: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServerPostAnalytics;
  const youtube = {
    getMediaAnalyticsBatch: vi.fn().mockResolvedValue(analytics),
  } satisfies ServerYouTubeAnalytics;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const credentials = {
    findConnectedAccounts: vi.fn().mockResolvedValue([{ id: 'cred-1' }]),
    findOne: vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'cred-1',
      organizationId: 'org-1',
      platform: 'YOUTUBE',
    }),
  } as unknown as ServerCredentialStore;
  const service = new AnalyticsYouTubeCollectionService(
    youtube,
    postAnalytics,
    collectionState,
    credentials,
    logger,
  );
  return { collectionState, postAnalytics, service, youtube };
}

function input(): YouTubeAnalyticsCollectionInput {
  return {
    attemptKey: 'attempt-1',
    brandId: 'brand-1',
    credentialId: 'cred-1',
    organizationId: 'org-1',
    posts: [
      {
        brandId: 'brand-1',
        credentialId: 'cred-1',
        externalId: 'video-1',
        id: 'post-1',
        organizationId: 'org-1',
      },
    ],
  };
}

describe('AnalyticsYouTubeCollectionService', () => {
  it('collects and finalizes exactly one action item', async () => {
    const harness = createHarness(new Map([['video-1', { views: 42 }]]));

    await harness.service.collect(input());

    expect(harness.youtube.getMediaAnalyticsBatch).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      ['video-1'],
      'cred-1',
    );
    expect(harness.postAnalytics.processYouTubeAnalytics).toHaveBeenCalledWith(
      'post-1',
      { views: 42 },
    );
    expect(harness.collectionState.markReadyBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'post-1',
        platform: CredentialPlatform.YOUTUBE,
      }),
    ]);
  });

  it('records delayed state and fails when provider data is unavailable', async () => {
    const harness = createHarness();

    await expect(harness.service.collect(input())).rejects.toThrow(
      'analytics are not available',
    );

    expect(harness.collectionState.markFailedBatch).toHaveBeenCalled();
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
