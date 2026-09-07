vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `decrypted:${value}` },
}));

import { InstagramBusinessDiscoveryProvider } from '@api/services/source-collector/providers/instagram-business-discovery.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { of, throwError } from 'rxjs';

describe('InstagramBusinessDiscoveryProvider', () => {
  const httpService = { get: vi.fn() };
  const instagramService = { getValidCredential: vi.fn() };

  let provider: InstagramBusinessDiscoveryProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    instagramService.getValidCredential.mockResolvedValue({
      accessToken: 'enc-token',
      externalId: 'brand-ig-user-1',
      id: 'cred-1',
    });
    provider = new InstagramBusinessDiscoveryProvider(
      httpService as never,
      instagramService as never,
    );
  });

  function discoveryResponse(
    ids: string[],
    options: { timestamp?: string } = {},
  ) {
    return of({
      data: {
        business_discovery: {
          followers_count: 12345,
          id: 'competitor-ig-user',
          media: {
            data: ids.map((id) => ({
              caption: `caption ${id}`,
              comments_count: 3,
              id,
              like_count: 20,
              media_product_type: 'FEED',
              media_type: 'IMAGE',
              media_url: `https://cdn/${id}.jpg`,
              permalink: `https://www.instagram.com/p/${id}/`,
              timestamp: options.timestamp ?? '2026-09-01T10:00:00+0000',
            })),
          },
          name: 'Competitor Brand',
          username: 'competitor',
        },
      },
    });
  }

  it('serves any org/brand request regardless of credentialId', async () => {
    await expect(
      provider.canCollect(SocialSourcePlatform.INSTAGRAM, {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);
    await expect(
      provider.canCollect(SocialSourcePlatform.INSTAGRAM, {
        brandId: 'brand-1',
      }),
    ).resolves.toBe(false);
    await expect(
      provider.canCollect(SocialSourcePlatform.TIKTOK, {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);
  });

  it('reads a competitor timeline through business_discovery using the brand credential', async () => {
    httpService.get.mockReturnValueOnce(discoveryResponse(['m1', 'm2']));

    const result = await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'competitor',
      { brandId: 'brand-1', organizationId: 'org-1', limit: 10 },
    );

    expect(result.provider).toBe('brand-oauth');
    expect(result.handle).toBe('competitor');
    expect(result.posts.map((post) => post.id)).toEqual(['m1', 'm2']);
    expect(result.posts[0]).toMatchObject({
      authorDisplayName: 'Competitor Brand',
      authorFollowersCount: 12345,
      authorId: 'competitor-ig-user',
      authorUsername: 'competitor',
      contentType: 'post',
      contentUrl: 'https://www.instagram.com/p/m1/',
      mediaUrls: ['https://cdn/m1.jpg'],
      metrics: { comments: 3, likes: 20 },
      text: 'caption m1',
    });

    expect(httpService.get).toHaveBeenCalledTimes(1);
    const [url, config] = httpService.get.mock.calls[0];
    expect(url).toContain('/brand-ig-user-1');
    expect(config.params.access_token).toBe('decrypted:enc-token');
    expect(config.params.fields).toContain(
      'business_discovery.username(competitor)',
    );
  });

  it('honours the requested limit', async () => {
    httpService.get.mockReturnValueOnce(discoveryResponse(['m1', 'm2', 'm3']));

    const result = await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'competitor',
      { brandId: 'brand-1', organizationId: 'org-1', limit: 2 },
    );

    expect(result.posts).toHaveLength(2);
  });

  it('stops at posts outside the since window', async () => {
    httpService.get.mockReturnValueOnce(
      discoveryResponse(['recent'], { timestamp: '2026-09-01T10:00:00+0000' }),
    );

    const result = await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'competitor',
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        since: new Date('2026-08-01T00:00:00Z'),
      },
    );

    expect(result.posts.map((post) => post.id)).toEqual(['recent']);
  });

  it('throws when Graph rejects the account as non-professional', async () => {
    httpService.get.mockReturnValueOnce(
      throwError(
        () =>
          new Error(
            'Unsupported request — target account is not a business/creator account',
          ),
      ),
    );

    await expect(
      provider.collectTimeline(SocialSourcePlatform.INSTAGRAM, 'personal', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow(/business\/creator/);
  });

  it('throws when the response has no business_discovery payload', async () => {
    httpService.get.mockReturnValueOnce(of({ data: {} }));

    await expect(
      provider.collectTimeline(SocialSourcePlatform.INSTAGRAM, 'competitor', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow(/no data/);
  });
});
