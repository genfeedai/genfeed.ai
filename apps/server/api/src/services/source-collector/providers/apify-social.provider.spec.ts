import { isSaaS } from '@genfeedai/config';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSaaS: vi.fn(() => false),
}));

import { ApifySocialProvider } from '@api/services/source-collector/providers/apify-social.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';

describe('ApifySocialProvider', () => {
  const apifyService = {
    getInstagramPostByUrl: vi.fn(),
    getTikTokVideoByUrl: vi.fn(),
    getInstagramUserPosts: vi.fn(),
    getLinkedInProfilePosts: vi.fn(),
    getTikTokUserVideos: vi.fn(),
  };

  let provider: ApifySocialProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSaaS).mockReturnValue(false);
    provider = new ApifySocialProvider(apifyService as never);
  });

  it('leaves X to the official X API providers', async () => {
    await expect(
      provider.canCollect(SocialSourcePlatform.TWITTER),
    ).resolves.toBe(false);
  });

  it('serves Instagram, TikTok and LinkedIn', async () => {
    for (const platform of [
      SocialSourcePlatform.INSTAGRAM,
      SocialSourcePlatform.TIKTOK,
      SocialSourcePlatform.LINKEDIN,
    ]) {
      await expect(provider.canCollect(platform)).resolves.toBe(true);
    }
  });

  it('never serves YouTube, whose policy bars scraped data', async () => {
    await expect(
      provider.canCollect(SocialSourcePlatform.YOUTUBE),
    ).resolves.toBe(false);
  });

  describe('LinkedIn', () => {
    it('maps profile posts by handle into collected posts', async () => {
      apifyService.getLinkedInProfilePosts.mockResolvedValue([
        {
          authorName: 'Acme Inc',
          commentsCount: 2,
          id: 'p1',
          imageUrl: 'https://img/p1.jpg',
          likesCount: 30,
          postedAt: '2026-08-02T00:00:00Z',
          postUrl: 'https://linkedin.com/feed/update/p1',
          text: 'We shipped a thing',
        },
      ]);

      const result = await provider.collectTimeline(
        SocialSourcePlatform.LINKEDIN,
        'acme',
        { limit: 10 },
      );

      expect(apifyService.getLinkedInProfilePosts).toHaveBeenCalledWith(
        'https://www.linkedin.com/in/acme',
        { limit: 10 },
        undefined,
      );
      expect(result.provider).toBe('apify');
      expect(result.posts).toEqual([
        {
          authorDisplayName: 'Acme Inc',
          authorUsername: 'acme',
          contentType: 'post',
          contentUrl: 'https://linkedin.com/feed/update/p1',
          createdAt: new Date('2026-08-02T00:00:00Z'),
          id: 'p1',
          isPinned: null,
          isPromoted: null,
          mediaUrls: ['https://img/p1.jpg'],
          metrics: { comments: 2, likes: 30, shares: undefined },
          platform: SocialSourcePlatform.LINKEDIN,
          text: 'We shipped a thing',
          thumbnailUrl: 'https://img/p1.jpg',
        },
      ]);
    });

    it('falls back to numLikes/numComments field names defensively', async () => {
      apifyService.getLinkedInProfilePosts.mockResolvedValue([
        {
          numComments: 1,
          numLikes: 2,
          urn: 'urn:li:activity:p2',
        },
      ]);

      const result = await provider.collectTimeline(
        SocialSourcePlatform.LINKEDIN,
        'acme',
        {},
      );

      expect(result.posts[0]).toMatchObject({
        id: 'urn:li:activity:p2',
        metrics: { comments: 1, likes: 2 },
      });
    });

    it('drops posts without an id or urn', async () => {
      apifyService.getLinkedInProfilePosts.mockResolvedValue([
        { text: 'no identity' },
      ]);

      const result = await provider.collectTimeline(
        SocialSourcePlatform.LINKEDIN,
        'acme',
        {},
      );

      expect(result.posts).toEqual([]);
    });
  });
  it.each([
    [SocialSourcePlatform.INSTAGRAM, 'getInstagramUserPosts'],
    [SocialSourcePlatform.TIKTOK, 'getTikTokUserVideos'],
    [SocialSourcePlatform.LINKEDIN, 'getLinkedInProfilePosts'],
  ] as const)(
    'passes canonical scope to hosted %s fallback',
    async (platform, method) => {
      vi.mocked(isSaaS).mockReturnValue(true);
      apifyService[method].mockResolvedValue([]);
      await provider.collectTimeline(platform, 'creator', {
        organizationId: 'org-1',
      });
      expect(apifyService[method]).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { organizationId: 'org-1', origin: 'social-source' },
      );
    },
  );
  it('passes missing hosted organization explicitly rather than raw execution', async () => {
    vi.mocked(isSaaS).mockReturnValue(true);
    apifyService.getInstagramUserPosts.mockResolvedValue([]);
    await provider.collectTimeline(
      SocialSourcePlatform.INSTAGRAM,
      'creator',
      {},
    );
    expect(apifyService.getInstagramUserPosts).toHaveBeenCalledWith(
      'creator',
      { limit: 25 },
      { organizationId: undefined, origin: 'social-source' },
    );
  });
  it.each([
    [SocialSourcePlatform.INSTAGRAM, 'getInstagramPostByUrl'],
    [SocialSourcePlatform.TIKTOK, 'getTikTokVideoByUrl'],
  ] as const)(
    'passes canonical scope to hosted %s post import',
    async (platform, method) => {
      vi.mocked(isSaaS).mockReturnValue(true);
      apifyService[method].mockResolvedValue({ id: '123' });
      await provider.collectPost(
        {
          platform,
          postId: '123',
          authorHandle: null,
          url: 'https://example.com/post',
        },
        { organizationId: 'org-1' },
      );
      expect(apifyService[method].mock.calls[0].at(-1)).toEqual({
        organizationId: 'org-1',
        origin: 'social-source',
      });
    },
  );
});
