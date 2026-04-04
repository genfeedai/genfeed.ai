import type { MonitoredAccountFilters } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { ConfigService } from '@api/config/config.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import {
  type SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import {
  ReplyBotPlatform,
  ReplyBotType,
  SocialContentType,
} from '@genfeedai/enums';
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
    getTwitterMentions: vi.fn().mockResolvedValue([]),
    getTwitterTweetReplies: vi.fn().mockResolvedValue([]),
    getTwitterUserTimeline: vi.fn().mockResolvedValue([]),
    getYouTubeChannelVideos: vi.fn().mockResolvedValue([]),
    getYouTubeVideoComments: vi.fn().mockResolvedValue([]),
    searchInstagramByHashtag: vi.fn().mockResolvedValue([]),
    searchRedditPosts: vi.fn().mockResolvedValue([]),
    searchTikTokByHashtag: vi.fn().mockResolvedValue([]),
    searchTwitterTweets: vi.fn().mockResolvedValue([]),
    searchYouTubeVideos: vi.fn().mockResolvedValue([]),
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
      ],
    }).compile();

    service = module.get<SocialMonitorService>(SocialMonitorService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should fetch twitter replies and normalise them', async () => {
    mockApifyService.getTwitterTweetReplies.mockResolvedValueOnce([
      {
        authorAvatarUrl: 'https://img.test/a.jpg',
        authorDisplayName: 'Alice',
        authorFollowersCount: 100,
        authorId: 'u1',
        authorUsername: 'alice',
        createdAt: new Date(),
        hashtags: ['ai'],
        id: 'tweet1',
        inReplyToTweetId: 'parent1',
        isRetweet: false,
        metrics: { likes: 5, replies: 2, retweets: 1 },
        text: 'Great thread!',
      },
    ]);

    const results = await service.getContentComments(
      ReplyBotPlatform.TWITTER,
      'parent1',
    );

    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe(ReplyBotPlatform.TWITTER);
    expect(results[0].text).toBe('Great thread!');
    expect(results[0].contentType).toBe(SocialContentType.TWEET);
  });

  it('should throw for unsupported platform in getContentComments', async () => {
    await expect(
      service.getContentComments('mastodon' as ReplyBotPlatform, 'id1'),
    ).rejects.toThrow(/Unsupported platform/);
  });

  it('should fetch twitter mentions', async () => {
    mockApifyService.getTwitterMentions.mockResolvedValueOnce([]);
    const result = await service.getUserMentions(
      ReplyBotPlatform.TWITTER,
      'testuser',
    );
    expect(result).toEqual([]);
    expect(mockApifyService.getTwitterMentions).toHaveBeenCalledWith(
      'testuser',
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('should return empty array for YouTube mentions', async () => {
    const result = await service.getUserMentions(
      ReplyBotPlatform.YOUTUBE,
      'channel1',
    );
    expect(result).toEqual([]);
  });

  it('should filter out retweets and replies from twitter timeline', async () => {
    mockApifyService.getTwitterUserTimeline.mockResolvedValueOnce([
      {
        authorId: 'u1',
        authorUsername: 'bob',
        createdAt: new Date(),
        id: 't1',
        inReplyToTweetId: null,
        isRetweet: false,
        text: 'Original tweet',
      },
      {
        authorId: 'u1',
        authorUsername: 'bob',
        createdAt: new Date(),
        id: 't2',
        inReplyToTweetId: null,
        isRetweet: true,
        text: 'RT @someone',
      },
      {
        authorId: 'u1',
        authorUsername: 'bob',
        createdAt: new Date(),
        id: 't3',
        inReplyToTweetId: 'parent',
        isRetweet: false,
        text: 'Reply to someone',
      },
    ]);

    const result = await service.getUserTimeline(
      ReplyBotPlatform.TWITTER,
      'bob',
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Original tweet');
  });

  it('should search twitter with query and limit', async () => {
    mockApifyService.searchTwitterTweets.mockResolvedValueOnce([]);
    await service.searchContent(ReplyBotPlatform.TWITTER, 'AI news', {
      limit: 10,
    });
    expect(mockApifyService.searchTwitterTweets).toHaveBeenCalledWith(
      'AI news',
      expect.objectContaining({ limit: 10 }),
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
