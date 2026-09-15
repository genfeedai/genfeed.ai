import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { CredentialPlatform } from '@genfeedai/contracts';
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
    }),
  };
  const analytics = {
    processFacebookAnalytics: vi.fn().mockResolvedValue(undefined),
    processThreadsAnalytics: vi.fn().mockResolvedValue(undefined),
  };
  const state = { markReady: vi.fn(), markFailedTargets: vi.fn() };
  const posts = { patch: vi.fn() };
  const service = new AnalyticsProviderCollectionService(
    credentials as never,
    { getPostAnalytics: vi.fn().mockResolvedValue({ views: 42 }) } as never,
    { getThreadInsights: vi.fn().mockResolvedValue({ views: 42 }) } as never,
    analytics as never,
    state as never,
    posts as never,
    { error: vi.fn() } as never,
    { upsertDailySnapshot: vi.fn() } as never,
  );
  return { service, analytics, state, posts };
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
      expect(persist).toHaveBeenCalledWith(
        'post',
        expect.any(Object),
        result.context,
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
