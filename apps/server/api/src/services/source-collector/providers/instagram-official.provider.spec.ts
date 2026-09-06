vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `decrypted:${value}` },
}));

import { InstagramOfficialProvider } from '@api/services/source-collector/providers/instagram-official.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { of } from 'rxjs';

describe('InstagramOfficialProvider', () => {
  const httpService = { get: vi.fn() };
  const instagramService = { getValidCredential: vi.fn() };
  const context = {
    brandId: 'brand-1',
    credentialId: 'cred-1',
    organizationId: 'org-1',
  };

  let provider: InstagramOfficialProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    instagramService.getValidCredential.mockResolvedValue({
      accessToken: 'enc-token',
      externalId: 'ig-user-1',
      id: 'cred-1',
    });
    provider = new InstagramOfficialProvider(
      httpService as never,
      instagramService as never,
    );
  });

  function mediaPage(
    ids: string[],
    options: { after?: string; timestamp?: string } = {},
  ) {
    return of({
      data: {
        data: ids.map((id) => ({
          caption: `caption ${id}`,
          comments_count: 2,
          id,
          insights: {
            data: [
              { name: 'impressions', values: [{ value: 100 }] },
              { name: 'reach', values: [{ value: 80 }] },
              { name: 'saved', values: [{ value: 5 }] },
            ],
          },
          like_count: 10,
          media_product_type: 'REELS',
          media_type: 'VIDEO',
          media_url: `https://cdn/${id}.mp4`,
          permalink: `https://www.instagram.com/p/${id}/`,
          thumbnail_url: `https://cdn/${id}.jpg`,
          timestamp: options.timestamp ?? '2026-09-01T10:00:00+0000',
        })),
        paging: options.after
          ? { cursors: { after: options.after }, next: 'https://next' }
          : {},
      },
    });
  }

  it('only serves own-account requests that carry a credential', async () => {
    await expect(
      provider.canCollect(SocialSourcePlatform.INSTAGRAM, context),
    ).resolves.toBe(true);
    await expect(
      provider.canCollect(SocialSourcePlatform.INSTAGRAM, {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);
    await expect(
      provider.canCollect(SocialSourcePlatform.TIKTOK, context),
    ).resolves.toBe(false);
  });

  it('paginates the media edge and maps insights into metrics', async () => {
    httpService.get
      .mockReturnValueOnce(mediaPage(['m1', 'm2'], { after: 'cursor-1' }))
      .mockReturnValueOnce(mediaPage(['m3']));

    const result = await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'brand',
      { ...context, limit: 10 },
    );

    expect(result.provider).toBe('brand-oauth');
    expect(result.posts.map((post) => post.id)).toEqual(['m1', 'm2', 'm3']);
    expect(result.posts[0]).toMatchObject({
      authorId: 'ig-user-1',
      authorUsername: 'brand',
      contentType: 'reel',
      contentUrl: 'https://www.instagram.com/p/m1/',
      mediaUrls: ['https://cdn/m1.mp4'],
      metrics: {
        comments: 2,
        impressions: 100,
        likes: 10,
        reach: 80,
        saves: 5,
        views: 100,
      },
      text: 'caption m1',
      thumbnailUrl: 'https://cdn/m1.jpg',
    });
    expect(httpService.get).toHaveBeenCalledTimes(2);
    expect(httpService.get.mock.calls[0][0]).toContain('/ig-user-1/media');
    expect(httpService.get.mock.calls[0][1].params.access_token).toBe(
      'decrypted:enc-token',
    );
    expect(httpService.get.mock.calls[1][1].params.after).toBe('cursor-1');
  });

  it('stops paginating once posts fall outside the since window', async () => {
    httpService.get
      .mockReturnValueOnce(
        mediaPage(['recent'], {
          after: 'cursor-1',
          timestamp: '2026-09-01T10:00:00+0000',
        }),
      )
      .mockReturnValueOnce(
        mediaPage(['old'], { timestamp: '2026-01-01T10:00:00+0000' }),
      );

    const result = await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'brand',
      { ...context, since: new Date('2026-06-01T00:00:00Z') },
    );

    expect(result.posts.map((post) => post.id)).toEqual(['recent']);
  });

  it('honours the requested limit across pages', async () => {
    httpService.get.mockReturnValueOnce(
      mediaPage(['m1', 'm2', 'm3'], { after: 'cursor-1' }),
    );

    const result = await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'brand',
      { ...context, limit: 2 },
    );

    expect(result.posts).toHaveLength(2);
    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('retries without insights when Graph rejects the insights fields', async () => {
    httpService.get
      .mockImplementationOnce(() => {
        throw {
          response: {
            data: {
              error: { message: 'Unsupported get request for insights metric' },
            },
          },
        };
      })
      .mockReturnValueOnce(mediaPage(['m1']));

    const result = await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'brand',
      context,
    );

    expect(result.posts).toHaveLength(1);
    expect(httpService.get.mock.calls[1][1].params.fields).not.toContain(
      'insights',
    );
  });

  it('fails loudly when the credential has no professional account id', async () => {
    instagramService.getValidCredential.mockResolvedValue({
      accessToken: 'enc-token',
      externalId: undefined,
      id: 'cred-1',
    });

    await expect(
      provider.collectTimeline(
        SocialSourcePlatform.INSTAGRAM,
        'brand',
        context,
      ),
    ).rejects.toThrow('professional account id');
  });
});
