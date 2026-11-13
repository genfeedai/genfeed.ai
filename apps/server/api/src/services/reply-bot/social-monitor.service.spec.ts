import type { MonitoredAccountFilters } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  type SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import {
  ReplyBotPlatform,
  ReplyBotType,
  SocialContentType,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const makeSocialContent = (
  overrides: Partial<SocialContentData> = {},
): SocialContentData => ({
  authorId: 'user1',
  authorUsername: 'testuser',
  contentType: SocialContentType.TWEET,
  createdAt: new Date(),
  id: `content-${Math.random().toString(36).slice(2, 8)}`,
  metrics: { likes: 10 },
  platform: ReplyBotPlatform.TWITTER,
  text: 'Hello world',
  ...overrides,
});

describe('SocialMonitorService', () => {
  let service: SocialMonitorService;

  const mockApifyService = {
    getInstagramPostComments: vi.fn().mockResolvedValue([]),
    getInstagramUserPosts: vi.fn().mockResolvedValue([]),
    getRedditPostComments: vi.fn().mockResolvedValue([]),
    getRedditUserPosts: vi.fn().mockResolvedValue([]),
    getTikTokUserVideos: vi.fn().mockResolvedValue([]),
    getTikTokVideoComments: vi.fn().mockResolvedValue([]),
    getYouTubeChannelVideos: vi.fn().mockResolvedValue([]),
    getYouTubeVideoComments: vi.fn().mockResolvedValue([]),
    searchInstagramByHashtag: vi.fn().mockResolvedValue([]),
    searchRedditPosts: vi.fn().mockResolvedValue([]),
    searchTikTokByHashtag: vi.fn().mockResolvedValue([]),
    searchYouTubeVideos: vi.fn().mockResolvedValue([]),
  };

  const mockTwitterService = {
    getTweetReplies: vi.fn().mockResolvedValue([]),
    getUserTimelineByUsername: vi.fn().mockResolvedValue([]),
    searchRecentTweets: vi.fn().mockResolvedValue([]),
    resolveBrandUserAccessToken: vi.fn().mockResolvedValue(null),
  };

  const mockProcessedTweetsService = {
    getProcessedTweetIds: vi.fn().mockResolvedValue(new Set()),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialMonitorService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('mock-value') },
        },
        { provide: LoggerService, useValue: mockLogger },
        {
          provide: ProcessedTweetsService,
          useValue: mockProcessedTweetsService,
        },
        { provide: ApifyService, useValue: mockApifyService },
        { provide: TwitterService, useValue: mockTwitterService },
      ],
    }).compile();

    service = module.get<SocialMonitorService>(SocialMonitorService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads X replies through the official X API', async () => {
    mockTwitterService.getTweetReplies.mockResolvedValueOnce([
      {
        authorId: 'u1',
        authorName: 'Alice',
        authorUsername: 'alice',
        createdAt: new Date(),
        id: 'tweet1',
        inReplyToId: 'parent1',
        metrics: { comments: 0, likes: 5, shares: 1 },
        text: 'Great thread!',
      },
    ]);

    const results = await service.getContentComments(
      ReplyBotPlatform.TWITTER,
      'parent1',
      { brandId: 'brand-1', organizationId: 'org-1' },
    );

    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe(ReplyBotPlatform.TWITTER);
    expect(results[0].text).toBe('Great thread!');
    expect(results[0].parentContentId).toBe('parent1');
    expect(results[0].contentType).toBe(SocialContentType.TWEET);
  });

  it('retries X replies with the app bearer when the brand token fails, then surfaces the last failure', async () => {
    mockTwitterService.resolveBrandUserAccessToken.mockResolvedValueOnce(
      'brand-token',
    );
    mockTwitterService.getTweetReplies
      .mockRejectedValueOnce(new Error('brand token expired'))
      .mockRejectedValueOnce(new Error('search not available'));

    await expect(
      service.getContentComments(ReplyBotPlatform.TWITTER, 'parent1', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow('search not available');

    expect(
      mockTwitterService.getTweetReplies.mock.calls.map(
        ([, options]) => options.accessToken,
      ),
    ).toEqual(['brand-token', undefined]);
  });

  it('reads X replies with the app bearer after an expired brand token', async () => {
    mockTwitterService.resolveBrandUserAccessToken.mockResolvedValueOnce(
      'brand-token',
    );
    mockTwitterService.getTweetReplies
      .mockRejectedValueOnce(new Error('brand token expired'))
      .mockResolvedValueOnce([
        {
          authorId: 'u1',
          authorUsername: 'alice',
          createdAt: new Date('2026-11-13T09:00:00.000Z'),
          id: 'tweet2',
          inReplyToId: 'parent1',
          text: 'Still readable',
        },
      ]);

    const results = await service.getContentComments(
      ReplyBotPlatform.TWITTER,
      'parent1',
      { brandId: 'brand-1', organizationId: 'org-1' },
    );

    expect(results.map((reply) => reply.text)).toEqual(['Still readable']);
  });

  it('should throw for unsupported platform in getContentComments', async () => {
    await expect(
      service.getContentComments('mastodon' as ReplyBotPlatform, 'id1'),
    ).rejects.toThrow(/Unsupported platform/);
  });

  it('should fetch twitter mentions through X recent search', async () => {
    mockTwitterService.searchRecentTweets.mockResolvedValueOnce([
      {
        authorId: 'u9',
        authorName: 'Dana',
        authorUsername: 'dana',
        createdAt: '2026-11-13T10:00:00.000Z',
        engagement: 3,
        id: 'm1',
        likes: 2,
        quotes: 0,
        replies: 1,
        retweets: 1,
        text: '@testuser nice launch',
      },
    ]);

    const result = await service.getUserMentions(
      ReplyBotPlatform.TWITTER,
      '@testuser',
      { sinceId: '100' },
    );

    expect(mockTwitterService.searchRecentTweets).toHaveBeenCalledWith(
      '@testuser',
      { maxResults: 50, sinceId: '100', sortOrder: 'recency' },
    );
    expect(result).toEqual([
      {
        authorDisplayName: 'Dana',
        authorId: 'u9',
        authorUsername: 'dana',
        contentType: SocialContentType.TWEET,
        contentUrl: 'https://x.com/dana/status/m1',
        createdAt: new Date('2026-11-13T10:00:00.000Z'),
        id: 'm1',
        metrics: { comments: 1, likes: 2, shares: 1 },
        platform: ReplyBotPlatform.TWITTER,
        text: '@testuser nice launch',
      },
    ]);
  });

  it('should return empty array for YouTube mentions', async () => {
    const result = await service.getUserMentions(
      ReplyBotPlatform.YOUTUBE,
      'channel1',
    );
    expect(result).toEqual([]);
  });

  it('reads the X timeline through the official API and asks X to drop replies and reposts by default', async () => {
    mockTwitterService.getUserTimelineByUsername.mockResolvedValueOnce([
      {
        authorAvatarUrl: 'https://img.test/bob.jpg',
        authorId: 'u1',
        authorName: 'Bob',
        authorUsername: 'bob',
        createdAt: new Date('2026-11-13T09:00:00.000Z'),
        id: 't1',
        inReplyToId: null,
        isRetweet: false,
        text: 'Original tweet',
      },
    ]);

    const result = await service.getUserTimeline(
      ReplyBotPlatform.TWITTER,
      'bob',
    );

    expect(mockTwitterService.getUserTimelineByUsername).toHaveBeenCalledWith(
      'bob',
      {
        accessToken: undefined,
        excludeReplies: true,
        excludeRetweets: true,
        maxResults: 20,
        sinceId: undefined,
      },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      authorAvatarUrl: 'https://img.test/bob.jpg',
      authorUsername: 'bob',
      contentUrl: 'https://x.com/bob/status/t1',
      text: 'Original tweet',
    });
  });

  it('keeps replies for Following when includeReplies is set', async () => {
    await service.getUserTimeline(ReplyBotPlatform.TWITTER, 'bob', {
      includeReplies: true,
    });

    expect(mockTwitterService.getUserTimelineByUsername).toHaveBeenCalledWith(
      'bob',
      expect.objectContaining({ excludeReplies: false, excludeRetweets: true }),
    );
  });

  it('retries the X timeline with the app bearer when the brand token fails, then surfaces the last failure', async () => {
    mockTwitterService.resolveBrandUserAccessToken.mockResolvedValueOnce(
      'brand-token',
    );
    mockTwitterService.getUserTimelineByUsername
      .mockRejectedValueOnce(new Error('brand token expired'))
      .mockRejectedValueOnce(new Error('app bearer unauthorized'));

    await expect(
      service.getUserTimeline(ReplyBotPlatform.TWITTER, 'bob', {
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    ).rejects.toThrow('app bearer unauthorized');

    expect(
      mockTwitterService.getUserTimelineByUsername.mock.calls.map(
        ([, options]) => options.accessToken,
      ),
    ).toEqual(['brand-token', undefined]);
  });

  it('preserves Instagram media in normalized timeline posts', async () => {
    mockApifyService.getInstagramUserPosts.mockResolvedValueOnce([
      {
        caption: 'Generated media workflow',
        id: 'instagram-1',
        imageUrl: 'https://cdn.example.com/preview.jpg',
        ownerUsername: 'creator',
        shortCode: 'abc123',
        videoUrl: 'https://cdn.example.com/video.mp4',
      },
    ]);

    const [post] = await service.getUserTimeline(
      ReplyBotPlatform.INSTAGRAM,
      'creator',
    );

    expect(post).toMatchObject({
      contentType: SocialContentType.REEL,
      mediaUrls: ['https://cdn.example.com/video.mp4'],
      thumbnailUrl: 'https://cdn.example.com/preview.jpg',
    });
  });

  it('should search twitter with query and limit', async () => {
    mockTwitterService.searchRecentTweets.mockResolvedValueOnce([]);
    await service.searchContent(ReplyBotPlatform.TWITTER, 'AI news', {
      limit: 10,
    });
    expect(mockTwitterService.searchRecentTweets).toHaveBeenCalledWith(
      'AI news',
      expect.objectContaining({ maxResults: 10, sortOrder: 'recency' }),
    );
  });

  it('should return all content when no filters provided', () => {
    const content = [makeSocialContent(), makeSocialContent()];
    expect(service.filterContent(content)).toHaveLength(2);
  });

  it('should include only content matching include keywords', () => {
    const content = [
      makeSocialContent({ text: 'I love AI tools' }),
      makeSocialContent({ text: 'Great weather today' }),
    ];
    const filters: MonitoredAccountFilters = {
      keywords: { exclude: [], include: ['AI'] },
    } as MonitoredAccountFilters;

    const result = service.filterContent(content, filters);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('AI');
  });

  it('should exclude content matching exclude keywords', () => {
    const content = [
      makeSocialContent({ text: 'Buy crypto now!' }),
      makeSocialContent({ text: 'AI content tips' }),
    ];
    const filters: MonitoredAccountFilters = {
      keywords: { exclude: ['crypto'], include: [] },
    } as MonitoredAccountFilters;

    const result = service.filterContent(content, filters);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('AI');
  });

  it('should filter by hashtag include', () => {
    const content = [
      makeSocialContent({ text: 'Check this out #ai #tech' }),
      makeSocialContent({ text: 'No hashtags here' }),
    ];
    const filters: MonitoredAccountFilters = {
      hashtags: { exclude: [], include: ['ai'] },
    } as MonitoredAccountFilters;

    const result = service.filterContent(content, filters);
    expect(result).toHaveLength(1);
  });

  it('should filter by minimum engagement', () => {
    const content = [
      makeSocialContent({ metrics: { likes: 100 } }),
      makeSocialContent({ metrics: { likes: 2 } }),
    ];
    const filters: MonitoredAccountFilters = {
      minEngagement: { minLikes: 50, minReplies: 0, minRetweets: 0 },
    } as MonitoredAccountFilters;

    const result = service.filterContent(content, filters);
    expect(result).toHaveLength(1);
    expect(result[0].metrics?.likes).toBe(100);
  });

  it('should return empty array when input is empty for filterUnprocessedContent', async () => {
    const result = await service.filterUnprocessedContent(
      [],
      'org1',
      ReplyBotType.REPLY_GUY,
    );
    expect(result).toEqual([]);
  });

  it('should filter out already processed content', async () => {
    const content = [
      makeSocialContent({ id: 'processed-1' }),
      makeSocialContent({ id: 'new-1' }),
    ];
    mockProcessedTweetsService.getProcessedTweetIds.mockResolvedValueOnce(
      new Set(['processed-1']),
    );

    const result = await service.filterUnprocessedContent(
      content,
      'org1',
      ReplyBotType.REPLY_GUY,
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new-1');
  });

  it('should build correct Twitter URL', () => {
    const url = service.buildContentUrl(
      ReplyBotPlatform.TWITTER,
      '123',
      'alice',
    );
    expect(url).toBe('https://x.com/alice/status/123');
  });

  it('should build correct YouTube URL', () => {
    const url = service.buildContentUrl(
      ReplyBotPlatform.YOUTUBE,
      'abc123',
      'channel',
    );
    expect(url).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('should build correct Instagram URL', () => {
    const url = service.buildContentUrl(
      ReplyBotPlatform.INSTAGRAM,
      'shortcode',
      'user',
    );
    expect(url).toBe('https://www.instagram.com/p/shortcode/');
  });
});
