vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `decrypted:${value}` },
}));

import { YoutubeOfficialProvider } from '@api/services/source-collector/providers/youtube-official.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { of } from 'rxjs';

describe('YoutubeOfficialProvider', () => {
  const httpService = { get: vi.fn() };
  const credentialsService = { resolveBrandAccount: vi.fn() };
  const youtubeService = { refreshToken: vi.fn() };
  const context = {
    brandId: 'brand-1',
    credentialId: 'cred-1',
    organizationId: 'org-1',
  };

  let provider: YoutubeOfficialProvider;

  function channelsPage() {
    return of({
      data: {
        items: [
          {
            contentDetails: { relatedPlaylists: { uploads: 'UU-uploads' } },
            id: 'UC-channel',
            snippet: { title: 'Genfeed' },
          },
        ],
      },
    });
  }

  function playlistPage(ids: string[], nextPageToken?: string) {
    return of({
      data: {
        items: ids.map((id) => ({ contentDetails: { videoId: id } })),
        ...(nextPageToken ? { nextPageToken } : {}),
      },
    });
  }

  function videosPage(
    ids: string[],
    options: { duration?: string; publishedAt?: string } = {},
  ) {
    return of({
      data: {
        items: ids.map((id) => ({
          contentDetails: { duration: options.duration ?? 'PT4M20S' },
          id,
          snippet: {
            description: `about ${id}`,
            publishedAt: options.publishedAt ?? '2026-09-01T10:00:00Z',
            thumbnails: { high: { url: `https://i.ytimg.com/${id}/hq.jpg` } },
            title: `Video ${id}`,
          },
          statistics: { commentCount: '4', likeCount: '25', viewCount: '900' },
        })),
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    credentialsService.resolveBrandAccount.mockResolvedValue({
      accessToken: 'enc',
      externalId: 'UC-channel',
      id: 'cred-1',
    });
    youtubeService.refreshToken.mockResolvedValue({
      credentials: { access_token: 'fresh-token' },
    });
    provider = new YoutubeOfficialProvider(
      httpService as never,
      credentialsService as never,
      youtubeService as never,
    );
  });

  it('is own-account only', async () => {
    await expect(
      provider.canCollect(SocialSourcePlatform.YOUTUBE, context),
    ).resolves.toBe(true);
    await expect(
      provider.canCollect(SocialSourcePlatform.YOUTUBE, {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);
  });

  it('walks the uploads playlist with page tokens and maps video statistics', async () => {
    httpService.get
      .mockReturnValueOnce(channelsPage())
      .mockReturnValueOnce(playlistPage(['v1', 'v2'], 'token-2'))
      .mockReturnValueOnce(videosPage(['v1', 'v2']))
      .mockReturnValueOnce(playlistPage(['v3']))
      .mockReturnValueOnce(videosPage(['v3'], { duration: 'PT45S' }));

    const result = await provider.collectTimeline(
      SocialSourcePlatform.YOUTUBE,
      'genfeed',
      { ...context, limit: 10 },
    );

    expect(result.provider).toBe('brand-oauth');
    expect(result.posts.map((post) => post.id)).toEqual(['v1', 'v2', 'v3']);
    expect(result.posts[0]).toMatchObject({
      authorDisplayName: 'Genfeed',
      authorId: 'UC-channel',
      authorUsername: 'genfeed',
      contentType: 'video',
      contentUrl: 'https://www.youtube.com/watch?v=v1',
      metrics: { comments: 4, likes: 25, views: 900 },
      text: 'Video v1\nabout v1',
      thumbnailUrl: 'https://i.ytimg.com/v1/hq.jpg',
    });
    expect(result.posts[2].contentType).toBe('short');
    expect(httpService.get.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer fresh-token',
    );
    expect(httpService.get.mock.calls[3][1].params.pageToken).toBe('token-2');
  });

  it('falls back to the stored token when refresh yields nothing', async () => {
    youtubeService.refreshToken.mockRejectedValue(new Error('refresh down'));
    httpService.get
      .mockReturnValueOnce(channelsPage())
      .mockReturnValueOnce(playlistPage([]));

    const result = await provider.collectTimeline(
      SocialSourcePlatform.YOUTUBE,
      'genfeed',
      context,
    );

    expect(result.posts).toEqual([]);
    expect(httpService.get.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer decrypted:enc',
    );
  });

  it('stops at the since window', async () => {
    httpService.get
      .mockReturnValueOnce(channelsPage())
      .mockReturnValueOnce(playlistPage(['new', 'old'], 'more'))
      .mockReturnValueOnce(
        of({
          data: {
            items: [
              {
                id: 'new',
                snippet: { publishedAt: '2026-09-01T10:00:00Z', title: 'New' },
              },
              {
                id: 'old',
                snippet: { publishedAt: '2026-01-01T10:00:00Z', title: 'Old' },
              },
            ],
          },
        }),
      );

    const result = await provider.collectTimeline(
      SocialSourcePlatform.YOUTUBE,
      'genfeed',
      { ...context, since: new Date('2026-06-01T00:00:00Z') },
    );

    expect(result.posts.map((post) => post.id)).toEqual(['new']);
    expect(httpService.get).toHaveBeenCalledTimes(3);
  });

  it('fails loudly when the credential channel cannot be resolved', async () => {
    credentialsService.resolveBrandAccount.mockResolvedValue({
      accessToken: 'enc',
      externalId: 'UC-other',
      id: 'cred-1',
    });
    httpService.get.mockReturnValueOnce(
      of({
        data: {
          items: [
            {
              contentDetails: { relatedPlaylists: { uploads: 'a' } },
              id: 'UC-1',
            },
            {
              contentDetails: { relatedPlaylists: { uploads: 'b' } },
              id: 'UC-2',
            },
          ],
        },
      }),
    );

    await expect(
      provider.collectTimeline(
        SocialSourcePlatform.YOUTUBE,
        'genfeed',
        context,
      ),
    ).rejects.toThrow('select a channel');
  });
});
