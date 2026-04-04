import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ApifyInstagramService } from '@api/services/integrations/apify/services/modules/apify-instagram.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ApifyInstagramService', () => {
  let service: ApifyInstagramService;
  let baseService: {
    ACTORS: Record<string, string>;
    calculateEngagementMetrics: ReturnType<typeof vi.fn>;
    calculateGrowthRate: ReturnType<typeof vi.fn>;
    calculateViralityScore: ReturnType<typeof vi.fn>;
    loggerService: {
      error: ReturnType<typeof vi.fn>;
      log: ReturnType<typeof vi.fn>;
    };
    runActor: ReturnType<typeof vi.fn>;
  };

  const mockPost = {
    caption: 'Check out this content #trending #reels',
    commentsCount: 50,
    hashtags: ['trending', 'reels'],
    id: 'post-1',
    imageUrl: 'https://instagram.com/img.jpg',
    likesCount: 1000,
    ownerUsername: 'creator1',
    timestamp: '2024-01-15T10:00:00Z',
    videoUrl: 'https://instagram.com/video.mp4',
    videoViewCount: 50000,
  };

  const mockHashtag = {
    mediaCount: 500000,
    name: 'trending',
  };

  const mockComment = {
    id: 'comment-1',
    likesCount: 10,
    ownerId: 'user-1',
    ownerProfilePicUrl: 'https://avatar.jpg',
    ownerUsername: 'commenter1',
    postId: 'post-1',
    postShortCode: 'ABC123',
    repliesCount: 3,
    text: 'Amazing content!',
    timestamp: '2024-01-16T10:00:00Z',
  };

  beforeEach(async () => {
    baseService = {
      ACTORS: {
        INSTAGRAM_COMMENT_SCRAPER: 'apify/instagram-comment-scraper',
        INSTAGRAM_HASHTAG: 'apify/instagram-hashtag-scraper',
        INSTAGRAM_SCRAPER: 'apify/instagram-scraper',
      },
      calculateEngagementMetrics: vi.fn().mockReturnValue({
        engagementRate: 2.1,
        velocity: 2083,
        viralScore: 55,
      }),
      calculateGrowthRate: vi.fn().mockReturnValue(65),
      calculateViralityScore: vi.fn().mockReturnValue(70),
      loggerService: { error: vi.fn(), log: vi.fn() },
      runActor: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApifyInstagramService,
        { provide: ApifyBaseService, useValue: baseService },
      ],
    }).compile();

    service = module.get<ApifyInstagramService>(ApifyInstagramService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getInstagramTrends normalizes hashtags to trend format', async () => {
    baseService.runActor.mockResolvedValue([mockHashtag]);
    const result = await service.getInstagramTrends({ limit: 5 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      mentions: 500000,
      platform: 'instagram',
      topic: 'trending',
    });
    expect(result[0].metadata.trendType).toBe('hashtag');
    expect(baseService.runActor).toHaveBeenCalledWith(
      'apify/instagram-hashtag-scraper',
      expect.objectContaining({
        hashtags: ['viral', 'reels'],
        resultsLimit: 3,
      }),
    );
  });

  it('getInstagramTrends caps total output to the requested limit', async () => {
    baseService.runActor.mockResolvedValue([
      { mediaCount: 10, name: 'seed-1' },
      { mediaCount: 40, name: 'seed-2' },
      { mediaCount: 30, name: 'seed-3' },
    ]);

    const result = await service.getInstagramTrends({ limit: 2 });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.topic)).toEqual(['seed-2', 'seed-3']);
  });

  it('getInstagramTrends returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('API error'));
    const result = await service.getInstagramTrends();
    expect(result).toEqual([]);
  });

  it('getInstagramVideos normalizes posts with video data', async () => {
    baseService.runActor.mockResolvedValue([mockPost]);
    const result = await service.getInstagramVideos(10);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      creatorHandle: 'creator1',
      platform: 'instagram',
      videoUrl: 'https://instagram.com/video.mp4',
      viewCount: 50000,
    });
  });

  it('getInstagramVideos filters out posts without video data', async () => {
    baseService.runActor.mockResolvedValue([
      { ...mockPost, videoUrl: undefined, videoViewCount: undefined },
    ]);
    const result = await service.getInstagramVideos();
    expect(result).toHaveLength(0);
  });

  it('getInstagramVideos returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('fail'));
    const result = await service.getInstagramVideos();
    expect(result).toEqual([]);
  });

  it('getInstagramPostComments normalizes comments', async () => {
    baseService.runActor.mockResolvedValue([mockComment]);
    const result = await service.getInstagramPostComments(
      'https://instagram.com/p/ABC123',
      { limit: 20 },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      authorUsername: 'commenter1',
      id: 'comment-1',
      text: 'Amazing content!',
    });
    expect(result[0].metrics.likes).toBe(10);
    expect(result[0].metrics.replies).toBe(3);
  });

  it('getInstagramPostComments returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('fail'));
    const result = await service.getInstagramPostComments('url');
    expect(result).toEqual([]);
  });

  it('getInstagramUserPosts returns raw posts', async () => {
    baseService.runActor.mockResolvedValue([mockPost]);
    const result = await service.getInstagramUserPosts('creator1', {
      limit: 10,
    });
    expect(result).toEqual([mockPost]);
    expect(baseService.runActor).toHaveBeenCalledWith(
      'apify/instagram-scraper',
      expect.objectContaining({ resultsLimit: 10, usernames: ['creator1'] }),
    );
  });

  it('getInstagramUserPosts returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('fail'));
    const result = await service.getInstagramUserPosts('user');
    expect(result).toEqual([]);
  });

  it('searchInstagramByHashtag strips # prefix', async () => {
    baseService.runActor.mockResolvedValue([mockPost]);
    const result = await service.searchInstagramByHashtag('#viral', {
      limit: 25,
    });
    expect(result).toEqual([mockPost]);
    expect(baseService.runActor).toHaveBeenCalledWith(
      'apify/instagram-hashtag-scraper',
      expect.objectContaining({ hashtags: ['viral'], resultsLimit: 25 }),
    );
  });

  it('searchInstagramByHashtag returns empty on error', async () => {
    baseService.runActor.mockRejectedValue(new Error('fail'));
    const result = await service.searchInstagramByHashtag('hashtag');
    expect(result).toEqual([]);
  });

  it('normalizes post with missing optional fields', async () => {
    baseService.runActor.mockResolvedValue([
      {
        id: 'post-minimal',
        videoUrl: 'https://video.mp4',
        videoViewCount: 100,
      },
    ]);
    const result = await service.getInstagramVideos(1);
    expect(result[0]).toMatchObject({
      commentCount: 0,
      creatorHandle: 'unknown',
      likeCount: 0,
      viewCount: 100,
    });
  });
});
