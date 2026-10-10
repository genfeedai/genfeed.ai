import type { TwitterAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import { analyticsCollectionAuthorizationFixture } from '@api/analytics/analytics-collection-authorization.fixture';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type {
  ServerCredentialStore,
  ServerLogger,
  ServerPostAnalytics,
  ServerTwitterAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { ServerAnalyticsCollectionState } from '@genfeedai/contracts/interfaces';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
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
    processInstagramAnalytics: vi.fn().mockResolvedValue(undefined),
    processLinkedInAnalytics: vi.fn().mockResolvedValue(undefined),
    processMastodonAnalytics: vi.fn().mockResolvedValue(undefined),
    processPinterestAnalytics: vi.fn().mockResolvedValue(undefined),
    processTikTokAnalytics: vi.fn().mockResolvedValue(undefined),
    processYouTubeAnalytics: vi.fn().mockResolvedValue(undefined),

    prepareLearningObservation: vi
      .fn<ServerPostAnalytics['prepareLearningObservation']>()
      .mockResolvedValue(null),
    processTwitterAnalytics: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerPostAnalytics;
  const twitter = {
    getMediaAnalyticsBatch: vi.fn().mockResolvedValue(analytics),
  } satisfies ServerTwitterAnalytics;
  const credentials = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findConnectedAccounts: vi.fn(),
    findOne: vi.fn(),
    mergeWarmupSignals: vi.fn(),
    patch: vi.fn(),
    resolveBrandAccount: vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      id: 'credential-1',
    }),
  } satisfies ServerCredentialStore;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;
  const accountSnapshots = {
    upsertDailySnapshot: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AnalyticsTwitterCollectionService(
    twitter,
    postAnalytics,
    credentials,
    collectionState,
    logger,
    accountSnapshots as never,
  );
  return {
    accountSnapshots,
    collectionState,
    credentials,
    postAnalytics,
    service,
    twitter,
  };
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

  it('propagates native denial before private account reads or provider dispatch', async () => {
    const h = createHarness();
    const denied = new Error('key_revoked');
    const authorization = {
      ...analyticsCollectionAuthorizationFixture,
      admit: vi.fn(async () => {
        throw denied;
      }),
    };
    await expect(h.service.collect(input(), authorization)).rejects.toBe(
      denied,
    );
    expect(h.credentials.resolveBrandAccount).not.toHaveBeenCalled();
    expect(h.twitter.getMediaAnalyticsBatch).not.toHaveBeenCalled();
    expect(h.collectionState.markFailedBatch).not.toHaveBeenCalled();
    expect(h.collectionState.markReadyBatch).not.toHaveBeenCalled();
  });

  it('holds collected data when authority is revoked during the provider await', async () => {
    const h = createHarness();
    const denied = new Error('membership_revoked');
    let revoked = false;
    const authorization = {
      ...analyticsCollectionAuthorizationFixture,
      admit: vi.fn(async () => {
        if (revoked) throw denied;
      }),
    };
    h.twitter.getMediaAnalyticsBatch.mockImplementation(async () => {
      revoked = true;
      return new Map([['tweet-1', { views: 42 }]]);
    });
    await expect(h.service.collect(input(), authorization)).rejects.toBe(
      denied,
    );
    expect(h.twitter.getMediaAnalyticsBatch).toHaveBeenCalledOnce();
    expect(h.postAnalytics.processTwitterAnalytics).not.toHaveBeenCalled();
    expect(h.collectionState.markFailedBatch).not.toHaveBeenCalled();
    expect(h.collectionState.markReadyBatch).not.toHaveBeenCalled();
    expect(h.accountSnapshots.upsertDailySnapshot).not.toHaveBeenCalled();
  });

  it('collects and finalizes exactly one action item', async () => {
    const harness = createHarness(new Map([['tweet-1', { views: 42 }]]));

    expect(
      await harness.service.collect(
        input(),
        analyticsCollectionAuthorizationFixture,
      ),
    ).toEqual({
      organizationId: 'org-1',
      brandId: 'brand-1',
      credentialId: 'credential-1',
    });

    expect(harness.postAnalytics.processTwitterAnalytics).toHaveBeenCalledWith(
      'post-1',
      { views: 42 },
      {
        brandId: 'brand-1',
        credentialId: 'credential-1',
        learningObservation: {
          receivedAt: expect.any(Date),
          requestStartedAt: expect.any(Date),
          sourceAttemptId: expect.any(String),
        },
        organizationId: 'org-1',
      },
      analyticsCollectionAuthorizationFixture,
    );
    expect(harness.accountSnapshots.upsertDailySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'credential-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.TWITTER,
      }),
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

    await expect(
      harness.service.collect(input(), analyticsCollectionAuthorizationFixture),
    ).rejects.toThrow('analytics are not available');

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

    await expect(
      harness.service.collect(batch, analyticsCollectionAuthorizationFixture),
    ).rejects.toThrow('requires exactly one post');
  });
});

function collectionSource(
  platform: Platform,
  organizationId: string,
  brandId: string,
  credentialId: string,
  postId: string,
  externalId: string,
): LearningPublicationSourceV1 {
  const association = {
    version: 1 as const,
    organizationId,
    brandId,
    credentialId,
    postId,
    externalId,
    platform,
    approvalId: 'approval',
    approvalOperationId: 'operation',
    versionPinId: 'pin',
    publishedAt: '2026-09-28T12:00:00.000Z',
    contentDigest: `sha256:v1:${'a'.repeat(64)}`,
    postSourceVersion: learningPublicationPostVersionV1({
      organizationId,
      brandId,
      credentialId,
      postId,
      externalId,
      platform,
      publishedAt: '2026-09-28T12:00:00.000Z',
      description: 'text',
    }),
  };
  return {
    ...association,
    finalizationId: 'finalization',
    finalizationVersion: learningPublicationFinalizationVersionV1(association),
    approvalVersion: learningHash(['approval']),
  };
}

describe('C3 twitter canonical pre-provider observation transport', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('prepares the exact resolved provider target before clocks/provider and carries the snapshot without rewriting metrics', async () => {
    const metrics = { views: 42 },
      h = createHarness(new Map([['tweet-1', metrics]])),
      data = input();
    const post = data.posts[0];
    if (!post) throw new Error('Missing fixture post');
    const source = collectionSource(
      Platform.TWITTER,
      post.organizationId,
      post.brandId,
      'credential-1',
      post.id,
      post.externalId,
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T11:59:59Z'));
    const trace: string[] = [];
    h.postAnalytics.prepareLearningObservation.mockImplementation(async () => {
      trace.push('prepare');
      vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
      return source;
    });
    h.twitter.getMediaAnalyticsBatch.mockImplementation(async () => {
      trace.push('provider');
      vi.setSystemTime(new Date('2026-09-30T12:00:01Z'));
      return new Map([[post.externalId, metrics]]);
    });
    h.postAnalytics.processTwitterAnalytics.mockImplementation(async () => {
      trace.push('persist');
    });
    await h.service.collect(data, analyticsCollectionAuthorizationFixture);
    expect(
      h.postAnalytics.prepareLearningObservation,
    ).toHaveBeenCalledExactlyOnceWith({
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId: 'credential-1',
      postId: post.id,
      platform: CredentialPlatform.TWITTER,
      externalId: post.externalId,
    });
    expect(trace).toEqual(['prepare', 'provider', 'persist']);
    expect(h.postAnalytics.processTwitterAnalytics).toHaveBeenCalledWith(
      post.id,
      metrics,
      expect.objectContaining({
        credentialId: 'credential-1',
        learningObservation: expect.objectContaining({
          publicationSource: source,
          sourceAttemptId: expect.any(String),
          requestStartedAt: expect.any(Date),
          receivedAt: expect.any(Date),
        }),
      }),
      analyticsCollectionAuthorizationFixture,
    );
    expect(
      h.postAnalytics.processTwitterAnalytics.mock.calls[0]?.[2]
        ?.learningObservation,
    ).toMatchObject({
      requestStartedAt: new Date('2026-09-30T12:00:00Z'),
      receivedAt: new Date('2026-09-30T12:00:01Z'),
    });
    expect(h.twitter.getMediaAnalyticsBatch).toHaveBeenCalledOnce();
  });
  it('keeps ordinary analytics when preparation is null and omits source authority', async () => {
    const h = createHarness(new Map([['tweet-1', { views: 42 }]]));
    await h.service.collect(input(), analyticsCollectionAuthorizationFixture);
    const context = h.postAnalytics.processTwitterAnalytics.mock.calls[0]?.[2];
    expect(context?.learningObservation).not.toHaveProperty(
      'publicationSource',
    );
  });
  it('propagates preparation DB failure before provider IO', async () => {
    const h = createHarness(),
      error = new Error('preparation DB');
    h.postAnalytics.prepareLearningObservation.mockRejectedValue(error);
    await expect(
      h.service.collect(input(), analyticsCollectionAuthorizationFixture),
    ).rejects.toBe(error);
    expect(h.twitter.getMediaAnalyticsBatch).not.toHaveBeenCalled();
    expect(h.postAnalytics.processTwitterAnalytics).not.toHaveBeenCalled();
  });
});
