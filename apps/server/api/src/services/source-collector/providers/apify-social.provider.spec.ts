import { ApifySocialProvider } from '@api/services/source-collector/providers/apify-social.provider';
import { SocialSourcePlatform } from '@genfeedai/contracts';

describe('ApifySocialProvider', () => {
  const apifyService = {
    getInstagramUserPosts: vi.fn(),
    getLinkedInProfilePosts: vi.fn(),
    getTikTokUserVideos: vi.fn(),
    getTwitterUserTimeline: vi.fn(),
    getYouTubeChannelUploads: vi.fn(),
  };

  let provider: ApifySocialProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ApifySocialProvider(apifyService as never);
  });

  it('serves X, Instagram, TikTok, YouTube and LinkedIn', async () => {
    for (const platform of [
      SocialSourcePlatform.TWITTER,
      SocialSourcePlatform.INSTAGRAM,
      SocialSourcePlatform.TIKTOK,
      SocialSourcePlatform.YOUTUBE,
      SocialSourcePlatform.LINKEDIN,
    ]) {
      await expect(provider.canCollect(platform)).resolves.toBe(true);
    }
  });

  describe('YouTube', () => {
    it('maps channel uploads by @handle into collected posts', async () => {
      apifyService.getYouTubeChannelUploads.mockResolvedValue([
        {
          channelId: 'UC123',
          channelName: 'Creator',
          commentCount: 4,
          id: 'v1',
          likeCount: 10,
          publishedAt: '2026-08-01T00:00:00Z',
          thumbnailUrl: 'https://img/v1.jpg',
          title: 'A video',
          url: 'https://youtube.com/watch?v=v1',
          viewCount: 100,
        },
      ]);

      const result = await provider.collectTimeline(
        SocialSourcePlatform.YOUTUBE,
        'creator',
        { limit: 10 },
      );

      expect(apifyService.getYouTubeChannelUploads).toHaveBeenCalledWith(
        'https://www.youtube.com/@creator',
        { limit: 10 },
      );
      expect(result.provider).toBe('apify');
      expect(result.posts).toEqual([
        {
          authorId: 'UC123',
          authorUsername: 'Creator',
          contentType: 'video',
          contentUrl: 'https://youtube.com/watch?v=v1',
          createdAt: new Date('2026-08-01T00:00:00Z'),
          id: 'v1',
          metrics: { comments: 4, likes: 10, views: 100 },
          platform: SocialSourcePlatform.YOUTUBE,
          text: 'A video',
          thumbnailUrl: 'https://img/v1.jpg',
        },
      ]);
    });

    it('resolves a canonical channel id to a /channel/ url', async () => {
      apifyService.getYouTubeChannelUploads.mockResolvedValue([]);

      await provider.collectTimeline(
        SocialSourcePlatform.YOUTUBE,
        'UC1234567890123456789012',
        {},
      );

      expect(apifyService.getYouTubeChannelUploads).toHaveBeenCalledWith(
        'https://www.youtube.com/channel/UC1234567890123456789012',
        { limit: 25 },
      );
    });

    it('drops videos without an id', async () => {
      apifyService.getYouTubeChannelUploads.mockResolvedValue([
        { title: 'no id' },
      ]);

      const result = await provider.collectTimeline(
        SocialSourcePlatform.YOUTUBE,
        'creator',
        {},
      );

      expect(result.posts).toEqual([]);
    });
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
});
