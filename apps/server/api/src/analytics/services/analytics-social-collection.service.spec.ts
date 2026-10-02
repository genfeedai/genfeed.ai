import type { SocialAnalyticsCollectionInput } from '@api/analytics/analytics-collection-action.types';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type {
  ServerCredentialStore,
  ServerLogger,
  ServerPostAnalytics,
  ServerPosts,
  ServerSocialAnalytics,
} from '@api/server.dependencies';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { ServerAnalyticsCollectionState } from '@genfeedai/contracts/interfaces';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import { AnalyticsSocialCollectionService } from './analytics-social-collection.service';

function createHarness() {
  const socialAnalytics = {
    getMediaAnalytics: vi.fn().mockResolvedValue({ views: 42 }),
  } satisfies ServerSocialAnalytics;
  const postAnalytics = {
    prepareLearningObservation: vi
      .fn<ServerPostAnalytics['prepareLearningObservation']>()
      .mockResolvedValue(null),
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
  const credentials = {
    findAll: vi.fn(),
    findBrandAccounts: vi.fn(),
    findConnectedAccounts: vi.fn().mockResolvedValue([{ id: 'cred-1' }]),
    findOne: vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'cred-1',
      organizationId: 'org-1',
      platform: 'INSTAGRAM',
    }),
    mergeWarmupSignals: vi.fn(),
    patch: vi.fn(),
    resolveBrandAccount: vi.fn(),
  } as unknown as ServerCredentialStore;
  const accountSnapshots = {
    upsertDailySnapshot: vi.fn().mockResolvedValue(undefined),
  };
  const service = new AnalyticsSocialCollectionService(
    socialAnalytics,
    socialAnalytics,
    socialAnalytics,
    socialAnalytics,
    socialAnalytics,
    postAnalytics,
    posts,
    collectionState,
    credentials,
    logger,
    accountSnapshots as never,
  );
  return {
    accountSnapshots,
    collectionState,
    credentials,
    postAnalytics,
    posts,
    service,
    socialAnalytics,
  };
}

function input(
  platform = CredentialPlatform.INSTAGRAM,
): SocialAnalyticsCollectionInput {
  return {
    attemptKey: 'attempt-1',
    posts: [
      {
        brandId: 'brand-1',
        credentialId: 'cred-1',
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

    expect(harness.socialAnalytics.getMediaAnalytics).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'external-1',
      'cred-1',
    );
    expect(
      harness.postAnalytics.processInstagramAnalytics,
    ).toHaveBeenCalledWith(
      'post-1',
      { mediaType: undefined, views: 42 },
      {
        brandId: 'brand-1',
        credentialId: 'cred-1',
        learningObservation: {
          receivedAt: expect.any(Date),
          requestStartedAt: expect.any(Date),
          sourceAttemptId: expect.any(String),
        },
        organizationId: 'org-1',
      },
    );
    expect(
      harness.postAnalytics.processInstagramAnalytics.mock.calls[0]?.[2]
        ?.learningObservation,
    ).not.toHaveProperty('publicationSource');
    expect(harness.collectionState.markReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1', organizationId: 'org-1' }),
    );
    expect(harness.accountSnapshots.upsertDailySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.INSTAGRAM,
      }),
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

describe('C3 social source preparation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('prepares exact resolved attribution before provider and transports canonical proof', async () => {
    const h = createHarness(),
      data = input(),
      post = data.posts[0];
    if (!post) throw new Error('Missing fixture post');
    const source = collectionSource(
        Platform.INSTAGRAM,
        post.organizationId,
        post.brandId,
        'cred-1',
        post.id,
        post.externalId,
      ),
      trace: string[] = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T11:59:59Z'));
    h.postAnalytics.prepareLearningObservation.mockImplementation(async () => {
      trace.push('prepare');
      vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
      return source;
    });
    h.socialAnalytics.getMediaAnalytics.mockImplementation(async () => {
      trace.push('provider');
      vi.setSystemTime(new Date('2026-09-30T12:00:01Z'));
      return { views: 42 };
    });
    h.postAnalytics.processInstagramAnalytics.mockImplementation(async () => {
      trace.push('persist');
    });
    await h.service.collect(data);
    expect(trace).toEqual(['prepare', 'provider', 'persist']);
    expect(
      h.postAnalytics.prepareLearningObservation,
    ).toHaveBeenCalledExactlyOnceWith({
      organizationId: post.organizationId,
      brandId: post.brandId,
      credentialId: 'cred-1',
      postId: post.id,
      platform: post.platform,
      externalId: post.externalId,
    });
    expect(h.postAnalytics.processInstagramAnalytics).toHaveBeenCalledWith(
      post.id,
      expect.objectContaining({ views: 42 }),
      expect.objectContaining({
        learningObservation: expect.objectContaining({
          publicationSource: source,
        }),
      }),
    );
    expect(
      h.postAnalytics.processInstagramAnalytics.mock.calls[0]?.[2]
        ?.learningObservation,
    ).toMatchObject({
      requestStartedAt: new Date('2026-09-30T12:00:00Z'),
      receivedAt: new Date('2026-09-30T12:00:01Z'),
    });
    expect(h.socialAnalytics.getMediaAnalytics).toHaveBeenCalledOnce();
  });
  it('preparation failure prevents provider IO', async () => {
    const h = createHarness(),
      error = new Error('preparation DB');
    h.postAnalytics.prepareLearningObservation.mockRejectedValue(error);
    await expect(h.service.collect(input())).rejects.toBe(error);
    expect(h.socialAnalytics.getMediaAnalytics).not.toHaveBeenCalled();
  });
});
