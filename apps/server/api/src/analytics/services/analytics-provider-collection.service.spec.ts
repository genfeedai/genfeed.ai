import { analyticsCollectionAuthorizationFixture as baseAuthorizationFixture } from '@api/analytics/analytics-collection-authorization.fixture';
import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPublicationFinalizationVersionV1,
  learningPublicationPostVersionV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import { delegateFindOneSelect } from '@api-test/mocks/service.mocks';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { LearningPublicationSourceV1 } from '@genfeedai/contracts/interfaces/analytics/outlier-persistence.interface';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';

const analyticsCollectionAuthorizationFixture = {
  ...baseAuthorizationFixture,
  initiatingActor: {
    ...baseAuthorizationFixture.initiatingActor,
    organizationId: 'org',
  },
};

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
    findOneSelect: delegateFindOneSelect(),
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
  const log = {
    failed: [] as unknown[],
    patched: [] as unknown[],
    persisted: [] as {
      context: Record<string, unknown>;
      metrics: Record<string, unknown>;
      platform: string;
      postId: string;
    }[],
    providerCalls: [] as unknown[][],
    ready: 0,
  };
  const persist =
    (platform: string) =>
    async (
      postId: string,
      metrics: Record<string, unknown>,
      context: Record<string, unknown>,
    ) => {
      log.persisted.push({ context, metrics, platform, postId });
    };
  analytics.processFacebookAnalytics.mockImplementation(persist('facebook'));
  analytics.processThreadsAnalytics.mockImplementation(persist('threads'));
  const state = {
    markReady: vi.fn(async () => {
      log.ready += 1;
    }),
    markFailedTargets: vi.fn(async (targets: unknown[]) => {
      log.failed.push(...targets);
    }),
  };
  const posts = {
    patch: vi.fn(async (...args: unknown[]) => {
      log.patched.push(args);
    }),
  };
  const recordProvider = async (...args: unknown[]) => {
    log.providerCalls.push(args);
    return { views: 42 };
  };
  const facebook = {
      getPostAnalytics: vi.fn(recordProvider),
    },
    threads = { getThreadInsights: vi.fn(recordProvider) };
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
  return {
    service,
    analytics,
    log,
    recordProvider,
    facebook,
    threads,
    credentials,
  };
}
describe('provider collection resolved account boundaries', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([CredentialPlatform.FACEBOOK, CredentialPlatform.THREADS])(
    'propagates native revocation after %s returns instead of disabling analytics',
    async (platform) => {
      const h = harness(platform);
      const denied = new Error('key_revoked');
      let revoked = false;
      const authorization = {
        ...analyticsCollectionAuthorizationFixture,
        admit: vi.fn(async () => {
          if (revoked) throw denied;
        }),
      };
      const provider =
        platform === CredentialPlatform.FACEBOOK
          ? h.facebook.getPostAnalytics
          : h.threads.getThreadInsights;
      provider.mockImplementation(async (...args: unknown[]) => {
        revoked = true;
        return h.recordProvider(...args);
      });
      const data = {
        posts: [
          {
            id: 'post',
            externalId: 'external',
            brandId: 'brand',
            organizationId: 'org',
            platform,
          },
        ],
      };
      await expect(
        platform === CredentialPlatform.FACEBOOK
          ? h.service.collectFacebook(data, authorization)
          : h.service.collectThreads(data, authorization),
      ).rejects.toBe(denied);
      expect(h.log).toEqual({
        failed: [],
        patched: [],
        persisted: [],
        providerCalls: [expect.arrayContaining(['external'])],
        ready: 0,
      });
    },
  );
  it('stops retrying a Facebook credential that needs its Page identity restored', async () => {
    const h = harness(CredentialPlatform.FACEBOOK);
    h.credentials.findOne.mockResolvedValue({
      id: 'resolved',
      organizationId: 'org',
      brandId: 'brand',
      platform: 'FACEBOOK',
      accessToken: 'token',
      externalId: '',
    });
    await expect(
      h.service.collectFacebook(
        {
          posts: [
            {
              id: 'post',
              externalId: 'external',
              brandId: 'brand',
              organizationId: 'org',
              platform: CredentialPlatform.FACEBOOK,
            },
          ],
        },
        analyticsCollectionAuthorizationFixture,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(h.log.providerCalls).toEqual([]);
    expect(h.log.failed).toEqual([
      expect.objectContaining({
        failure: expect.objectContaining({
          code: 'analytics.authentication_failed',
          isRetryable: false,
        }),
      }),
    ]);
  });

  it('uses the selected Page token and video metrics for a published Facebook video', async () => {
    const h = harness(CredentialPlatform.FACEBOOK);
    await h.service.collectFacebook(
      {
        posts: [
          {
            id: 'post',
            externalId: 'video-1',
            brandId: 'brand',
            organizationId: 'org',
            platform: CredentialPlatform.FACEBOOK,
            isVideo: true,
          },
        ],
      },
      analyticsCollectionAuthorizationFixture,
    );
    expect(h.log.providerCalls).toEqual([['video-1', 'token', 'page', true]]);
  });

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
          ? await h.service.collectFacebook(
              input,
              analyticsCollectionAuthorizationFixture,
            )
          : await h.service.collectThreads(
              input,
              analyticsCollectionAuthorizationFixture,
            );
      expect(result).toMatchObject({
        processed: 1,
        context: {
          organizationId: 'org',
          brandId: 'brand',
          credentialId: 'resolved',
        },
      });
      expect(h.log.ready).toBe(1);
      expect(h.log.providerCalls).toHaveLength(1);
      expect(h.log.persisted).toEqual([
        {
          context: {
            ...result.context,
            learningObservation: {
              receivedAt: expect.any(Date),
              requestStartedAt: expect.any(Date),
              sourceAttemptId: expect.any(String),
            },
          },
          metrics: expect.objectContaining({ views: 42 }),
          platform: platform.toLowerCase(),
          postId: 'post',
        },
      ]);
    },
  );
  it('propagates persistence failure without disabling valid providers', async () => {
    const h = harness(CredentialPlatform.THREADS);
    h.analytics.processThreadsAnalytics.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(
      h.service.collectThreads(
        {
          posts: [
            {
              id: 'post',
              externalId: 'external',
              organizationId: 'org',
              brandId: 'brand',
              platform: CredentialPlatform.THREADS,
            },
          ],
        },
        analyticsCollectionAuthorizationFixture,
      ),
    ).rejects.toThrow('database unavailable');
    expect(h.log.ready).toBe(0);
    expect(h.log.failed).toHaveLength(1);
    expect(h.log.patched).toEqual([]);
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
      const prepared: unknown[] = [];
      h.analytics.prepareLearningObservation.mockImplementation(
        async (scope) => {
          prepared.push(scope);
          trace.push('prepare');
          vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
          return source;
        },
      );
      const provider =
        platform === CredentialPlatform.FACEBOOK
          ? h.facebook.getPostAnalytics
          : h.threads.getThreadInsights;
      provider.mockImplementation(async (...args: unknown[]) => {
        trace.push('provider');
        vi.setSystemTime(new Date('2026-09-30T12:00:01Z'));
        return h.recordProvider(...args);
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
        await h.service.collectFacebook(
          input,
          analyticsCollectionAuthorizationFixture,
        );
      else
        await h.service.collectThreads(
          input,
          analyticsCollectionAuthorizationFixture,
        );
      expect(trace).toEqual(['prepare', 'provider']);
      expect(prepared).toEqual([
        {
          organizationId: 'org',
          brandId: 'brand',
          credentialId: 'resolved',
          postId: 'post',
          platform,
          externalId: 'external',
        },
      ]);
      expect(h.log.persisted).toEqual([
        expect.objectContaining({
          context: expect.objectContaining({
            learningObservation: expect.objectContaining({
              publicationSource: source,
              receivedAt: new Date('2026-09-30T12:00:01Z'),
              requestStartedAt: new Date('2026-09-30T12:00:00Z'),
            }),
          }),
          metrics: expect.objectContaining({ views: 42 }),
          postId: 'post',
        }),
      ]);
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
          ? h.service.collectFacebook(
              input,
              analyticsCollectionAuthorizationFixture,
            )
          : h.service.collectThreads(
              input,
              analyticsCollectionAuthorizationFixture,
            ),
      ).rejects.toBe(error);
      expect(h.log.providerCalls).toEqual([]);
      expect(h.log.persisted).toEqual([]);
    },
  );
});
