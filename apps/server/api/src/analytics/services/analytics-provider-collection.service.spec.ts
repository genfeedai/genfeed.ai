import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';

function harness(platform: CredentialPlatform) {
  vi.spyOn(EncryptionUtil, 'decrypt').mockImplementation((value) => value);
  const credentials = {
    findConnectedAccounts: vi.fn().mockResolvedValue([{ id: 'resolved' }]),
    findOne: vi.fn().mockResolvedValue({
      id: 'resolved',
      organizationId: 'org',
      brandId: 'brand',
      platform: platform.toUpperCase(),
      accessToken: 'token',
      externalId: 'page',
    }),
  };
  const analytics = {
    prepareLearningObservation: vi
      .fn<
        (
          input: Pick<
            LearningPublicationSourceV1,
            | 'organizationId'
            | 'brandId'
            | 'credentialId'
            | 'postId'
            | 'platform'
            | 'externalId'
          >,
        ) => Promise<LearningPublicationSourceV1 | null>
      >()
      .mockResolvedValue(null),
    processFacebookAnalytics: vi.fn().mockResolvedValue(undefined),
    processThreadsAnalytics: vi.fn().mockResolvedValue(undefined),
  };
  const state = { markReady: vi.fn(), markFailedTargets: vi.fn() };
  const posts = { patch: vi.fn() };
  const facebook = {
      getPostAnalytics: vi.fn().mockResolvedValue({ views: 42 }),
    },
    threads = { getThreadInsights: vi.fn().mockResolvedValue({ views: 42 }) };
  const service = new AnalyticsProviderCollectionService(
    credentials as never,
    facebook as never,
    threads as never,
    analytics as never,
    state as never,
    posts as never,
    { error: vi.fn() } as never,
    { upsertDailySnapshot: vi.fn() } as never,
  );
  return { service, analytics, state, posts, facebook, threads };
}
describe('provider collection resolved account boundaries', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([CredentialPlatform.FACEBOOK, CredentialPlatform.THREADS])(
    'returns resolved legacy context after %s persistence and ready state',
    async (platform) => {
      const h = harness(platform);
      const input = {
        posts: [
          {
            id: 'post',
            externalId: 'external',
            organizationId: 'org',
            brandId: 'brand',
            platform,
          },
        ],
      };
      const result =
        platform === CredentialPlatform.FACEBOOK
          ? await h.service.collectFacebook(input)
          : await h.service.collectThreads(input);
      expect(result).toMatchObject({
        processed: 1,
        context: {
          organizationId: 'org',
          brandId: 'brand',
          credentialId: 'resolved',
        },
      });
      expect(h.state.markReady).toHaveBeenCalledOnce();
      const persist =
        platform === CredentialPlatform.FACEBOOK
          ? h.analytics.processFacebookAnalytics
          : h.analytics.processThreadsAnalytics;
      expect(
        persist.mock.calls[0]?.[2]?.learningObservation,
      ).not.toHaveProperty('publicationSource');
      expect(
        platform === CredentialPlatform.FACEBOOK
          ? h.facebook.getPostAnalytics
          : h.threads.getThreadInsights,
      ).toHaveBeenCalledOnce();
      expect(persist).toHaveBeenCalledWith(
        'post',
        expect.objectContaining({ views: 42 }),
        {
          ...result.context,
          learningObservation: {
            receivedAt: expect.any(Date),
            requestStartedAt: expect.any(Date),
            sourceAttemptId: expect.any(String),
          },
        },
      );
    },
  );
  it('propagates persistence failure without disabling valid providers', async () => {
    const h = harness(CredentialPlatform.THREADS);
    h.analytics.processThreadsAnalytics.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(
      h.service.collectThreads({
        posts: [
          {
            id: 'post',
            externalId: 'external',
            organizationId: 'org',
            brandId: 'brand',
            platform: CredentialPlatform.THREADS,
          },
        ],
      }),
    ).rejects.toThrow('database unavailable');
    expect(h.state.markReady).not.toHaveBeenCalled();
    expect(h.state.markFailedTargets).toHaveBeenCalledOnce();
    expect(h.posts.patch).not.toHaveBeenCalled();
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

describe('C3 Facebook/Threads pre-provider source transport', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it.each([CredentialPlatform.FACEBOOK, CredentialPlatform.THREADS])(
    'prepares resolved %s scope before provider and carries exact snapshot',
    async (platform) => {
      const h = harness(platform),
        source = collectionSource(
          platform,
          'org',
          'brand',
          'resolved',
          'post',
          'external',
        ),
        trace: string[] = [];
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-30T11:59:59Z'));
      h.analytics.prepareLearningObservation.mockImplementation(async () => {
        trace.push('prepare');
        vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
        return source;
      });
      const provider =
        platform === CredentialPlatform.FACEBOOK
          ? h.facebook.getPostAnalytics
          : h.threads.getThreadInsights;
      provider.mockImplementation(async () => {
        trace.push('provider');
        vi.setSystemTime(new Date('2026-09-30T12:00:01Z'));
        return { views: 42 };
      });
      const input = {
        posts: [
          {
            id: 'post',
            externalId: 'external',
            organizationId: 'org',
            brandId: 'brand',
            platform,
          },
        ],
      };
      if (platform === CredentialPlatform.FACEBOOK)
        await h.service.collectFacebook(input);
      else await h.service.collectThreads(input);
      expect(trace).toEqual(['prepare', 'provider']);
      expect(
        h.analytics.prepareLearningObservation,
      ).toHaveBeenCalledExactlyOnceWith({
        organizationId: 'org',
        brandId: 'brand',
        credentialId: 'resolved',
        postId: 'post',
        platform,
        externalId: 'external',
      });
      const persist =
        platform === CredentialPlatform.FACEBOOK
          ? h.analytics.processFacebookAnalytics
          : h.analytics.processThreadsAnalytics;
      expect(persist.mock.calls[0]?.[2]?.learningObservation).toMatchObject({
        requestStartedAt: new Date('2026-09-30T12:00:00Z'),
        receivedAt: new Date('2026-09-30T12:00:01Z'),
      });
      expect(persist).toHaveBeenCalledWith(
        'post',
        expect.objectContaining({ views: 42 }),
        expect.objectContaining({
          learningObservation: expect.objectContaining({
            publicationSource: source,
            requestStartedAt: expect.any(Date),
            receivedAt: expect.any(Date),
          }),
        }),
      );
    },
  );
  it.each([CredentialPlatform.FACEBOOK, CredentialPlatform.THREADS])(
    'does not call %s provider when preparation throws',
    async (platform) => {
      const h = harness(platform),
        error = new Error('preparation DB');
      h.analytics.prepareLearningObservation.mockRejectedValue(error);
      const input = {
        posts: [
          {
            id: 'post',
            externalId: 'external',
            organizationId: 'org',
            brandId: 'brand',
            platform,
          },
        ],
      };
      await expect(
        platform === CredentialPlatform.FACEBOOK
          ? h.service.collectFacebook(input)
          : h.service.collectThreads(input),
      ).rejects.toBe(error);
      expect(h.facebook.getPostAnalytics).not.toHaveBeenCalled();
      expect(h.threads.getThreadInsights).not.toHaveBeenCalled();
    },
  );
});
