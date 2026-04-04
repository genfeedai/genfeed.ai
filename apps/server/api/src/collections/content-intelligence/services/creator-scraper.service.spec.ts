import {
  CreatorScraperService,
  type ScrapedPost,
} from '@api/collections/content-intelligence/services/creator-scraper.service';
import {
  ContentIntelligencePlatform,
  CreatorAnalysisStatus,
} from '@genfeedai/enums';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApifyService = {
  runActor: vi.fn(),
};

const mockContentIntelligenceService = {
  findOne: vi.fn(),
  updateCreatorProfile: vi.fn(),
  updateStatus: vi.fn(),
};

const mockLogger = {
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

function makeService() {
  return new CreatorScraperService(
    mockApifyService as any,
    mockContentIntelligenceService as any,
    mockLogger as any,
  );
}

const creatorId = new Types.ObjectId();

function makeCreator(platform: ContentIntelligencePlatform) {
  return {
    _id: creatorId,
    handle: 'testuser',
    isDeleted: false,
    platform,
    scrapeConfig: { maxPosts: 50 },
  };
}

// ─── calculateAggregateMetrics ─────────────────────────────────────────────

describe('CreatorScraperService.calculateAggregateMetrics', () => {
  let service: CreatorScraperService;

  beforeEach(() => {
    service = makeService();
  });

  it('returns zeroed metrics for empty array', () => {
    const result = service.calculateAggregateMetrics([]);
    expect(result).toEqual({
      avgComments: 0,
      avgEngagementRate: 0,
      avgLikes: 0,
      avgShares: 0,
      avgViralScore: 0,
      bestPostingTimes: [],
      postFrequency: 0,
      topHashtags: [],
    });
  });

  it('calculates averages correctly for single post', () => {
    const post: ScrapedPost = {
      comments: 20,
      engagementRate: 13.0,
      hashtags: ['ai', 'tech'],
      id: '1',
      likes: 100,
      publishedAt: new Date('2024-01-15T10:00:00Z'),
      shares: 10,
      text: 'Hello world',
      views: 1000,
    };

    const result = service.calculateAggregateMetrics([post]);
    expect(result.avgLikes).toBe(100);
    expect(result.avgComments).toBe(20);
    expect(result.avgShares).toBe(10);
    expect(result.avgEngagementRate).toBe(13.0);
    expect(result.topHashtags).toEqual(['ai', 'tech']);
  });

  it('calculates averages across multiple posts', () => {
    const posts: ScrapedPost[] = [
      {
        comments: 10,
        engagementRate: 11.5,
        hashtags: ['ai'],
        id: '1',
        likes: 100,
        publishedAt: new Date('2024-01-01T09:00:00Z'),
        shares: 5,
        text: 'Post 1',
        views: 1000,
      },
      {
        comments: 20,
        engagementRate: 11.5,
        hashtags: ['ai', 'marketing'],
        id: '2',
        likes: 200,
        publishedAt: new Date('2024-01-08T09:00:00Z'),
        shares: 10,
        text: 'Post 2',
        views: 2000,
      },
    ];

    const result = service.calculateAggregateMetrics(posts);
    expect(result.avgLikes).toBe(150);
    expect(result.avgComments).toBe(15);
    expect(result.avgShares).toBe(8); // Math.round(15/2)
    expect(result.avgEngagementRate).toBe(11.5);
  });

  it('ranks hashtags by frequency', () => {
    const posts: ScrapedPost[] = [
      {
        comments: 0,
        engagementRate: 10,
        hashtags: ['ai', 'tech'],
        id: '1',
        likes: 1,
        publishedAt: new Date(),
        shares: 0,
        text: 'a',
        views: 10,
      },
      {
        comments: 0,
        engagementRate: 10,
        hashtags: ['ai', 'startup'],
        id: '2',
        likes: 1,
        publishedAt: new Date(),
        shares: 0,
        text: 'b',
        views: 10,
      },
      {
        comments: 0,
        engagementRate: 10,
        hashtags: ['tech'],
        id: '3',
        likes: 1,
        publishedAt: new Date(),
        shares: 0,
        text: 'c',
        views: 10,
      },
    ];

    const result = service.calculateAggregateMetrics(posts);
    expect(result.topHashtags[0]).toBe('ai');
    expect(result.topHashtags[1]).toBe('tech');
    expect(result.topHashtags).toContain('startup');
  });

  it('limits topHashtags to 10', () => {
    const hashtags = Array.from({ length: 15 }, (_, i) => `tag${i}`);
    const posts: ScrapedPost[] = [
      {
        comments: 0,
        engagementRate: 10,
        hashtags,
        id: '1',
        likes: 1,
        publishedAt: new Date(),
        shares: 0,
        text: 'a',
        views: 10,
      },
    ];

    const result = service.calculateAggregateMetrics(posts);
    expect(result.topHashtags.length).toBeLessThanOrEqual(10);
  });

  it('computes avgViralScore from top 10% performers', () => {
    const posts: ScrapedPost[] = Array.from({ length: 10 }, (_, i) => ({
      comments: 0,
      engagementRate: i * 2.5,
      hashtags: [],
      id: String(i),
      likes: i * 100,
      publishedAt: new Date(),
      shares: 0,
      text: 'test',
      views: 1000,
    }));

    const result = service.calculateAggregateMetrics(posts);
    // top 10% of 10 posts = 1 post, the one with highest engagement (22.5)
    expect(result.avgViralScore).toBe(22.5);
  });

  it('calculates post frequency in posts per week', () => {
    const posts: ScrapedPost[] = [
      {
        comments: 0,
        engagementRate: 0,
        hashtags: [],
        id: '1',
        likes: 0,
        publishedAt: new Date('2024-01-01T00:00:00Z'),
        shares: 0,
        text: 'a',
        views: 0,
      },
      {
        comments: 0,
        engagementRate: 0,
        hashtags: [],
        id: '2',
        likes: 0,
        publishedAt: new Date('2024-01-08T00:00:00Z'),
        shares: 0,
        text: 'b',
        views: 0,
      },
    ];

    const result = service.calculateAggregateMetrics(posts);
    // 2 posts over 1 week = 2 posts/week
    expect(result.postFrequency).toBe(2);
  });

  it('identifies best posting times by hour', () => {
    const posts: ScrapedPost[] = [
      {
        comments: 0,
        engagementRate: 0,
        hashtags: [],
        id: '1',
        likes: 0,
        publishedAt: new Date('2024-01-01T09:00:00Z'),
        shares: 0,
        text: 'a',
        views: 0,
      },
      {
        comments: 0,
        engagementRate: 0,
        hashtags: [],
        id: '2',
        likes: 0,
        publishedAt: new Date('2024-01-02T09:00:00Z'),
        shares: 0,
        text: 'b',
        views: 0,
      },
      {
        comments: 0,
        engagementRate: 0,
        hashtags: [],
        id: '3',
        likes: 0,
        publishedAt: new Date('2024-01-03T14:00:00Z'),
        shares: 0,
        text: 'c',
        views: 0,
      },
    ];

    const result = service.calculateAggregateMetrics(posts);
    const expectedHour = new Date('2024-01-01T09:00:00Z')
      .getHours()
      .toString()
      .padStart(2, '0');
    expect(result.bestPostingTimes[0]).toBe(`${expectedHour}:00`);
  });
});

// ─── scrapeCreator ─────────────────────────────────────────────────────────

describe('CreatorScraperService.scrapeCreator', () => {
  let service: CreatorScraperService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();
  });

  it('returns null when creator not found', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(null);

    const result = await service.scrapeCreator(creatorId);
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('handles unsupported platform and returns null', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue({
      ...makeCreator('youtube' as any),
    });
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);

    const result = await service.scrapeCreator(creatorId);
    expect(result).toBeNull();
    expect(mockContentIntelligenceService.updateStatus).toHaveBeenCalledWith(
      creatorId,
      CreatorAnalysisStatus.FAILED,
      expect.stringContaining('Unsupported platform'),
    );
  });

  it('calls apify with correct actor for LinkedIn and returns mapped posts', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(
      makeCreator(ContentIntelligencePlatform.LINKEDIN),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateCreatorProfile.mockResolvedValue(
      undefined,
    );

    mockApifyService.runActor.mockResolvedValue([
      {
        connectionsCount: 1000,
        followersCount: 5000,
        fullName: 'John Doe',
        headline: 'Engineer',
        posts: [
          {
            commentCount: 20,
            impressionCount: 2000,
            postedAt: '2024-01-15T10:00:00Z',
            postUrl: 'https://linkedin.com/post/1',
            reactionCount: 100,
            shareCount: 10,
            text: 'Hello LinkedIn #tech',
          },
        ],
        profilePicture: 'https://img.com/pic.jpg',
      },
    ]);

    const result = await service.scrapeCreator(creatorId);
    expect(result).not.toBeNull();
    expect(result!.profile.displayName).toBe('John Doe');
    expect(result!.profile.followerCount).toBe(5000);
    expect(result!.posts).toHaveLength(1);
    expect(result!.posts[0].text).toBe('Hello LinkedIn #tech');
    expect(result!.posts[0].hashtags).toEqual(['tech']);
    expect(result!.posts[0].likes).toBe(100);
    expect(result!.posts[0].engagementRate).toBeGreaterThan(0);

    expect(mockApifyService.runActor).toHaveBeenCalledWith(
      'curious_coder/linkedin-profile-scraper',
      expect.objectContaining({ maxPosts: 50 }),
    );
    expect(mockContentIntelligenceService.updateStatus).toHaveBeenCalledWith(
      creatorId,
      CreatorAnalysisStatus.ANALYZING,
    );
  });

  it('maps TikTok data correctly', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(
      makeCreator(ContentIntelligencePlatform.TIKTOK),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateCreatorProfile.mockResolvedValue(
      undefined,
    );

    mockApifyService.runActor.mockResolvedValue([
      {
        authorMeta: {
          avatar: 'https://img.com/av.jpg',
          fans: 10000,
          following: 500,
          nickName: 'TikToker',
          signature: 'bio',
        },
        commentCount: 50,
        createTime: 1705312800,
        diggCount: 500,
        hashtags: [{ name: 'dance' }],
        id: 'vid1',
        playCount: 10000,
        shareCount: 30,
        text: 'Cool video #dance',
        webVideoUrl: 'https://tiktok.com/vid/1',
      },
    ]);

    const result = await service.scrapeCreator(creatorId);
    expect(result!.profile.displayName).toBe('TikToker');
    expect(result!.posts[0].likes).toBe(500);
    expect(result!.posts[0].views).toBe(10000);
    expect(result!.posts[0].hashtags).toEqual(['dance']);
  });

  it('updates status to FAILED when apify throws', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(
      makeCreator(ContentIntelligencePlatform.TWITTER),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);

    mockApifyService.runActor.mockRejectedValue(new Error('Apify down'));

    const result = await service.scrapeCreator(creatorId);
    expect(result).toBeNull();
    expect(mockContentIntelligenceService.updateStatus).toHaveBeenCalledWith(
      creatorId,
      CreatorAnalysisStatus.FAILED,
      'Apify down',
    );
  });

  it('computes LinkedIn engagement rate from impressions', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(
      makeCreator(ContentIntelligencePlatform.LINKEDIN),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateCreatorProfile.mockResolvedValue(
      undefined,
    );

    mockApifyService.runActor.mockResolvedValue([
      {
        followersCount: 1000,
        fullName: 'Jane',
        posts: [
          {
            commentCount: 10,
            impressionCount: 1000,
            postUrl: 'url',
            reactionCount: 50,
            shareCount: 5,
            text: 'post',
          },
        ],
      },
    ]);

    const result = await service.scrapeCreator(creatorId);
    // (50+10+5)/1000 * 100 = 6.5
    expect(result!.posts[0].engagementRate).toBe(6.5);
  });

  it('falls back to likes*20 when impressionCount missing for LinkedIn', async () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(
      makeCreator(ContentIntelligencePlatform.LINKEDIN),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateCreatorProfile.mockResolvedValue(
      undefined,
    );

    mockApifyService.runActor.mockResolvedValue([
      {
        followersCount: 1000,
        fullName: 'Jane',
        posts: [
          {
            postUrl: 'url',
            reactionCount: 100,
            text: 'post',
            // no impressionCount
          },
        ],
      },
    ]);

    const result = await service.scrapeCreator(creatorId);
    const post = result!.posts[0];
    // views = likes * 20 = 2000; engagement = 100/2000 * 100 = 5
    expect(post.views).toBe(2000);
    expect(post.engagementRate).toBe(5);
  });
});

// ─── extractHashtags (via scrapeCreator output) ────────────────────────────

describe('CreatorScraperService hashtag extraction', () => {
  let service: CreatorScraperService;

  beforeEach(() => {
    service = makeService();
    vi.clearAllMocks();
  });

  it('extracts hashtags from text with # symbols', () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(
      makeCreator(ContentIntelligencePlatform.LINKEDIN),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateCreatorProfile.mockResolvedValue(
      undefined,
    );

    mockApifyService.runActor.mockResolvedValue([
      {
        fullName: 'User',
        posts: [
          {
            impressionCount: 100,
            postUrl: 'url',
            reactionCount: 10,
            text: 'Check out #AI and #MachineLearning trends',
          },
        ],
      },
    ]);

    return service.scrapeCreator(creatorId).then((result) => {
      expect(result!.posts[0].hashtags).toEqual(['AI', 'MachineLearning']);
    });
  });

  it('returns empty array when no hashtags', () => {
    mockContentIntelligenceService.findOne.mockResolvedValue(
      makeCreator(ContentIntelligencePlatform.LINKEDIN),
    );
    mockContentIntelligenceService.updateStatus.mockResolvedValue(undefined);
    mockContentIntelligenceService.updateCreatorProfile.mockResolvedValue(
      undefined,
    );

    mockApifyService.runActor.mockResolvedValue([
      {
        fullName: 'User',
        posts: [
          {
            impressionCount: 100,
            postUrl: 'url',
            reactionCount: 10,
            text: 'Just a normal post without hashtags',
          },
        ],
      },
    ]);

    return service.scrapeCreator(creatorId).then((result) => {
      expect(result!.posts[0].hashtags).toEqual([]);
    });
  });
});
