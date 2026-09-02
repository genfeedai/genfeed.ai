import type { TwitterAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import type {
  ServerCredentialStore,
  ServerLogger,
  ServerPostAnalytics,
  ServerTwitterAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { ServerAnalyticsCollectionState } from '@genfeedai/contracts/interfaces';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { AnalyticsTwitterCollectionService } from './analytics-twitter-collection.service';

function createHarness(analytics = new Map<string, unknown>()) {
  vi.spyOn(EncryptionUtil, 'decrypt').mockImplementation((value) => value);
  const collectionState = {
    markFailed: vi.fn().mockResolvedValue(undefined),
    markFailedBatch: vi.fn().mockResolvedValue(undefined),
    markFailedTargets: vi.fn().mockResolvedValue(undefined),
    markReady: vi.fn().mockResolvedValue(undefined),
    markReadyBatch: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerAnalyticsCollectionState;
  const postAnalytics = {
    processTwitterAnalytics: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServerPostAnalytics;
  const twitter = {
    getMediaAnalyticsBatch: vi.fn().mockResolvedValue(analytics),
  } satisfies ServerTwitterAnalytics;
  const credentials = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findOne: vi.fn().mockResolvedValue({ accessToken: 'access-token' }),
    mergeWarmupSignals: vi.fn(),
    patch: vi.fn(),
    resolveBrandAccount: vi.fn(),
  } satisfies ServerCredentialStore;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const service = new AnalyticsTwitterCollectionService(
    twitter,
    postAnalytics,
    credentials,
    collectionState,
    logger,
  );
  return { collectionState, postAnalytics, service, twitter };
}

function input(): TwitterAnalyticsCollectionInput {
  return {
    attemptKey: 'attempt-1',
    credentialId: 'credential-1',
    posts: [
      {
        brandId: 'brand-1',
        externalId: 'tweet-1',
        id: 'post-1',
        organizationId: 'org-1',
      },
    ],
  };
}

describe('AnalyticsTwitterCollectionService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('collects and finalizes exactly one action item', async () => {
    const harness = createHarness(new Map([['tweet-1', { views: 42 }]]));

    await harness.service.collect(input());

    expect(harness.postAnalytics.processTwitterAnalytics).toHaveBeenCalledWith(
      'post-1',
      { views: 42 },
    );
    expect(harness.collectionState.markReadyBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'post-1',
        platform: CredentialPlatform.TWITTER,
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
