import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@api/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@api/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@api/analytics/services/analytics-youtube-collection.service';
import type { AccountAnalyticsSnapshotService } from '@api/endpoints/analytics/account-analytics-snapshot.service';
import type {
  ServerCredentialStore,
  ServerPostAnalytics,
} from '@api/server.dependencies';
import { Platform, toPrismaCredentialPlatform } from '@genfeedai/contracts';
import type {
  AnalyticsPersistenceContext,
  BreakoutPublicationSourceV1,
  ServerAnalyticsCollectionState,
} from '@genfeedai/contracts/interfaces';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';

const routes = [
  [Platform.TWITTER, 'text'],
  [Platform.YOUTUBE, 'video'],
  [Platform.INSTAGRAM, 'carousel'],
  [Platform.TIKTOK, 'short'],
  [Platform.PINTEREST, 'image'],
  [Platform.LINKEDIN, 'text'],
  [Platform.MASTODON, 'text'],
  [Platform.FACEBOOK, 'video'],
  [Platform.THREADS, 'text'],
  ...(['image', 'carousel', 'video', 'short', 'thread'] as const).map(
    (format) => [Platform.TWITTER, format] as const,
  ),
] satisfies ReadonlyArray<
  readonly [Platform, BreakoutPublicationSourceV1['format']]
>;

function harness(
  platform: Platform,
  format: BreakoutPublicationSourceV1['format'],
) {
  vi.spyOn(EncryptionUtil, 'decrypt').mockImplementation((value) => value);
  const source: BreakoutPublicationSourceV1 = {
    version: 1,
    organizationId: 'org-a',
    brandId: 'brand-a',
    credentialId: 'credential-a',
    postId: 'post-a',
    externalId: 'external-a',
    platform,
    format,
    publishedAt: '2026-10-08T11:00:00Z',
    contentDigest: 'digest-a',
    publicationFingerprint: 'publication-a',
    logicalPostId: 'logical-a',
    isResponse: false,
  };
  const preparation = vi.fn(async () => source);
  const persist = vi.fn(
    async (
      _id: string,
      _metrics: unknown,
      _context: AnalyticsPersistenceContext,
    ) => {},
  );
  const analytics = {
    prepareLearningObservation: vi.fn(async () => null),
    prepareExposureObservation: preparation,
    processTwitterAnalytics: persist,
    processYouTubeAnalytics: persist,
    processInstagramAnalytics: persist,
    processTikTokAnalytics: persist,
    processPinterestAnalytics: persist,
    processLinkedInAnalytics: persist,
    processMastodonAnalytics: persist,
    processFacebookAnalytics: persist,
    processThreadsAnalytics: persist,
  } satisfies ServerPostAnalytics;
  const providerFetch = vi.fn(async () => ({
    views: 100,
    likes: 1,
    comments: 0,
    shares: 0,
  }));
  const batchFetch = vi.fn(
    async () => new Map([['external-a', await providerFetch()]]),
  );
  const provider = {
    getMediaAnalytics: providerFetch,
    getPostAnalytics: providerFetch,
    getThreadInsights: providerFetch,
  };
  const credential = {
    id: source.credentialId,
    brandId: source.brandId,
    organizationId: source.organizationId,
    platform: toPrismaCredentialPlatform(platform),
    accessToken: 'fake-token',
    externalId: 'fake-page',
  };
  const credentials = {
    findOne: vi.fn(async () => credential),
    resolveBrandAccount: vi.fn(async () => credential),
    findConnectedAccounts: vi.fn(async () => [credential]),
  } as unknown as ServerCredentialStore;
  const state = {
    markReady: vi.fn(async () => {}),
    markReadyBatch: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    markFailedBatch: vi.fn(async () => {}),
    markFailedTargets: vi.fn(async () => {}),
  } satisfies ServerAnalyticsCollectionState;
  const snapshots = {
    upsertDailySnapshot: vi.fn(async () => {}),
  } as unknown as AccountAnalyticsSnapshotService;
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const posts = { patch: vi.fn(async () => {}) };
  const post = {
    id: source.postId,
    organizationId: source.organizationId,
    brandId: source.brandId,
    externalId: source.externalId,
    credentialId: source.credentialId,
    platform,
  };
  async function collect() {
    if (platform === Platform.TWITTER) {
      const service = new AnalyticsTwitterCollectionService(
        { getMediaAnalyticsBatch: batchFetch },
        analytics,
        credentials,
        state,
        logger,
        snapshots,
      );
      return service.collect({
        credentialId: source.credentialId,
        posts: [post],
      });
    }
    if (platform === Platform.YOUTUBE) {
      const service = new AnalyticsYouTubeCollectionService(
        { getMediaAnalyticsBatch: batchFetch },
        analytics,
        state,
        credentials,
        logger,
        snapshots,
      );
      return service.collect({
        organizationId: source.organizationId,
        brandId: source.brandId,
        credentialId: source.credentialId,
        posts: [post],
      });
    }
    if (platform === Platform.FACEBOOK || platform === Platform.THREADS) {
      const service = new AnalyticsProviderCollectionService(
        credentials as unknown as ConstructorParameters<
          typeof AnalyticsProviderCollectionService
        >[0],
        provider as unknown as ConstructorParameters<
          typeof AnalyticsProviderCollectionService
        >[1],
        provider as unknown as ConstructorParameters<
          typeof AnalyticsProviderCollectionService
        >[2],
        analytics as unknown as ConstructorParameters<
          typeof AnalyticsProviderCollectionService
        >[3],
        state as unknown as ConstructorParameters<
          typeof AnalyticsProviderCollectionService
        >[4],
        posts as unknown as ConstructorParameters<
          typeof AnalyticsProviderCollectionService
        >[5],
        logger as unknown as ConstructorParameters<
          typeof AnalyticsProviderCollectionService
        >[6],
        snapshots,
      );
      return platform === Platform.FACEBOOK
        ? service.collectFacebook({ posts: [post] })
        : service.collectThreads({ posts: [post] });
    }
    const service = new AnalyticsSocialCollectionService(
      provider,
      provider,
      provider,
      provider,
      provider,
      analytics,
      posts,
      state,
      credentials,
      logger,
      snapshots,
    );
    return service.collect({ posts: [post] });
  }
  return { source, preparation, persist, providerFetch, collect };
}

describe('prospective exposure source across collector routes', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(routes)(
    'prepares %s %s source before provider collection and retains the timing receipt',
    async (platform, format) => {
      const h = harness(platform, format);
      await h.collect();
      expect(h.preparation).toHaveBeenCalledOnce();
      expect(h.preparation.mock.invocationCallOrder[0]).toBeLessThan(
        h.providerFetch.mock.invocationCallOrder[0],
      );
      expect(h.persist).toHaveBeenCalledOnce();
      const context = h.persist.mock.calls[0]?.[2];
      expect(context?.exposureObservation).toMatchObject({
        source: h.source,
        sourceAttemptId: expect.any(String),
        requestStartedAt: expect.any(Date),
        receivedAt: expect.any(Date),
      });
      expect(context?.exposureObservation?.source.format).toBe(format);
      expect(context?.learningObservation).not.toHaveProperty(
        'publicationSource',
      );
      expect(context?.exposureObservation?.sourceAttemptId).toBe(
        context?.learningObservation?.sourceAttemptId,
      );
      expect(context?.exposureObservation?.requestStartedAt).toEqual(
        context?.learningObservation?.requestStartedAt,
      );
      expect(context?.exposureObservation?.receivedAt).toEqual(
        context?.learningObservation?.receivedAt,
      );
    },
  );
});
