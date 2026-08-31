import { Timeframe } from '@genfeedai/enums';
import { TrendVideoService } from '@server/collections/trends/services/modules/trend-video.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendVideoService', () => {
  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockCacheService = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const mockApifyService = {
    getInstagramVideos: vi.fn(),
    getRedditVideos: vi.fn(),
    getTikTokSounds: vi.fn(),
    getTikTokVideos: vi.fn(),
    getTrendingHashtags: vi.fn(),
    getYouTubeVideos: vi.fn(),
  };

  const mockYoutubeService = {
    getTrends: vi.fn(),
  };

  type MockTrendDelegate = {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  let mockPrisma: {
    trendingHashtag: MockTrendDelegate;
    trendingSound: MockTrendDelegate;
    trendingVideo: MockTrendDelegate;
  };
  let service: TrendVideoService;

  // Helper to build a Prisma-style trending doc with data blob
  const makeVideoDoc = (overrides: Record<string, unknown> = {}) => ({
    createdAt: new Date(),
    data: {
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      isCurrent: true,
      isDeleted: false,
      ...overrides,
    },
    id: 'video-1',
    isDeleted: false,
    updatedAt: new Date(),
  });

  const makeHashtagDoc = (overrides: Record<string, unknown> = {}) => ({
    createdAt: new Date(),
    data: {
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      isCurrent: true,
      isDeleted: false,
      ...overrides,
    },
    id: 'hashtag-1',
    isDeleted: false,
    updatedAt: new Date(),
  });

  const makeSoundDoc = (overrides: Record<string, unknown> = {}) => ({
    createdAt: new Date(),
    data: {
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      isCurrent: true,
      isDeleted: false,
      ...overrides,
    },
    id: 'sound-1',
    isDeleted: false,
    updatedAt: new Date(),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      trendingHashtag: {
        create: vi.fn().mockResolvedValue({ id: 'created-hashtag' }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      trendingSound: {
        create: vi.fn().mockResolvedValue({ id: 'created-sound' }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      trendingVideo: {
        create: vi.fn().mockResolvedValue({ id: 'created-video' }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);
    mockYoutubeService.getTrends.mockResolvedValue([]);

    service = new TrendVideoService(
      mockPrisma as never,
      mockLoggerService as never,
      mockCacheService as never,
      mockApifyService as never,
      mockYoutubeService as never,
    );
  });

  it('returns empty viral videos when the database is empty without triggering Apify', async () => {
    mockPrisma.trendingVideo.findMany.mockResolvedValue([]);

    const result = await service.getViralVideos({
      limit: 10,
      timeframe: Timeframe.H24,
    });

    expect(result).toEqual([]);
    expect(mockApifyService.getTikTokVideos).not.toHaveBeenCalled();
    expect(mockPrisma.trendingVideo.findMany).toHaveBeenCalled();
  });

  it('does not fetch viral videos on demand when the database already has data', async () => {
    mockPrisma.trendingVideo.findMany.mockResolvedValue([
      makeVideoDoc({
        externalId: 'video-1',
        platform: 'tiktok',
        title: 'Trend video',
        viralScore: 88,
      }),
    ]);

    const result = await service.getViralVideos({ limit: 10 });

    expect(result).toHaveLength(1);
    expect(mockApifyService.getTikTokVideos).not.toHaveBeenCalled();
    expect(mockPrisma.trendingVideo.findMany).toHaveBeenCalled();
  });

  it('returns empty hashtags when the database is empty without triggering Apify', async () => {
    mockPrisma.trendingHashtag.findMany.mockResolvedValue([]);

    const result = await service.getTrendingHashtags({ limit: 10 });

    expect(result).toEqual([]);
    expect(mockApifyService.getTrendingHashtags).not.toHaveBeenCalled();
    expect(mockPrisma.trendingHashtag.findMany).toHaveBeenCalled();
  });

  it('returns empty sounds when the database is empty without triggering Apify', async () => {
    mockPrisma.trendingSound.findMany.mockResolvedValue([]);

    const result = await service.getTrendingSounds({ limit: 10 });

    expect(result).toEqual([]);
    expect(mockApifyService.getTikTokSounds).not.toHaveBeenCalled();
    expect(mockPrisma.trendingSound.findMany).toHaveBeenCalled();
  });

  it('filters videos by platform in-memory', async () => {
    mockPrisma.trendingVideo.findMany.mockResolvedValue([
      makeVideoDoc({ platform: 'tiktok', viralScore: 90 }),
      makeVideoDoc({ platform: 'instagram', viralScore: 80 }),
    ]);

    const result = await service.getViralVideos({
      limit: 10,
      platform: 'tiktok',
    });

    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).platform).toBe('tiktok');
  });

  it('filters videos by minViralScore in-memory', async () => {
    mockPrisma.trendingVideo.findMany.mockResolvedValue([
      makeVideoDoc({ platform: 'tiktok', viralScore: 90 }),
      makeVideoDoc({ platform: 'tiktok', viralScore: 30 }),
    ]);

    const result = await service.getViralVideos({
      limit: 10,
      minViralScore: 50,
    });

    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).viralScore).toBe(90);
  });

  it('returns empty for hashtags filtered by platform', async () => {
    mockPrisma.trendingHashtag.findMany.mockResolvedValue([
      makeHashtagDoc({
        hashtag: '#test',
        platform: 'instagram',
        postCount: 100,
      }),
    ]);

    const result = await service.getTrendingHashtags({
      limit: 10,
      platform: 'tiktok',
    });

    expect(result).toHaveLength(0);
  });

  describe('fetchAndCacheViralVideos', () => {
    it('uses native YouTube discovery before the governed Apify fallback', async () => {
      mockYoutubeService.getTrends.mockResolvedValue([
        {
          channelTitle: 'Native channel',
          commentCount: 4,
          id: 'native-video',
          likeCount: 25,
          publishedAt: '2026-08-31T08:00:00.000Z',
          tags: [],
          title: 'Native trend',
          url: 'https://youtube.test/watch?v=native-video',
          viewCount: 1000,
        },
      ]);

      await expect(
        service.fetchAndCacheViralVideos('youtube', 12),
      ).resolves.toBe(1);

      expect(mockYoutubeService.getTrends).toHaveBeenCalledWith('US', 12);
      expect(mockApifyService.getYouTubeVideos).not.toHaveBeenCalled();
      expect(mockPrisma.trendingVideo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: expect.objectContaining({
            externalId: 'native-video',
            provider: 'youtube-data-api-v3',
          }),
        }),
      });
    });

    it('scores native YouTube velocity from the publication age', async () => {
      mockYoutubeService.getTrends.mockResolvedValue([
        {
          channelTitle: 'Older native channel',
          commentCount: 4,
          id: 'older-native-video',
          likeCount: 25,
          publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          tags: [],
          title: 'Older native trend',
          url: 'https://youtube.test/watch?v=older-native-video',
          viewCount: 1008,
        },
      ]);

      await service.fetchAndCacheViralVideos('youtube', 12);

      expect(mockPrisma.trendingVideo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: expect.objectContaining({ velocity: 21 }),
        }),
      });
    });

    it('reads existing videos once for the whole batch and updates the match', async () => {
      mockApifyService.getTikTokVideos.mockResolvedValue([
        { externalId: 'a', title: 'A' },
        { externalId: 'b', title: 'B' },
        { externalId: 'c', title: 'C' },
      ]);
      mockPrisma.trendingVideo.findMany.mockResolvedValue([
        {
          ...makeVideoDoc({ externalId: 'b', platform: 'tiktok' }),
          id: 'video-b',
        },
      ]);

      await service.fetchAndCacheViralVideos('tiktok', 3);

      expect(mockPrisma.trendingVideo.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trendingVideo.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trendingVideo.update).toHaveBeenCalledWith({
        data: { data: expect.objectContaining({ externalId: 'b' }) },
        where: { id: 'video-b' },
      });
      expect(mockPrisma.trendingVideo.create).toHaveBeenCalledTimes(2);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('creates a new video when no existing record matches', async () => {
      mockApifyService.getTikTokVideos.mockResolvedValue([
        { externalId: 'a', title: 'A' },
      ]);
      mockPrisma.trendingVideo.findMany.mockResolvedValue([]);

      await service.fetchAndCacheViralVideos('tiktok', 1);

      expect(mockPrisma.trendingVideo.update).not.toHaveBeenCalled();
      expect(mockPrisma.trendingVideo.create).toHaveBeenCalledTimes(1);
    });

    it('does not match the same externalId on another platform', async () => {
      mockApifyService.getTikTokVideos.mockResolvedValue([
        { externalId: 'a', title: 'A' },
      ]);
      mockPrisma.trendingVideo.findMany.mockResolvedValue([
        {
          ...makeVideoDoc({ externalId: 'a', platform: 'instagram' }),
          id: 'video-instagram',
        },
      ]);

      await service.fetchAndCacheViralVideos('tiktok', 1);

      expect(mockPrisma.trendingVideo.update).not.toHaveBeenCalled();
      expect(mockPrisma.trendingVideo.create).toHaveBeenCalledTimes(1);
    });

    it('keeps the newest row per key when duplicates exist', async () => {
      mockApifyService.getTikTokVideos.mockResolvedValue([
        { externalId: 'a', title: 'A' },
      ]);
      // Rows arrive `createdAt desc`, so the first duplicate is the newest.
      mockPrisma.trendingVideo.findMany.mockResolvedValue([
        {
          ...makeVideoDoc({ externalId: 'a', platform: 'tiktok' }),
          id: 'video-newest',
        },
        {
          ...makeVideoDoc({ externalId: 'a', platform: 'tiktok' }),
          id: 'video-oldest',
        },
      ]);

      await service.fetchAndCacheViralVideos('tiktok', 1);

      expect(mockPrisma.trendingVideo.update).toHaveBeenCalledWith({
        data: { data: expect.objectContaining({ externalId: 'a' }) },
        where: { id: 'video-newest' },
      });
    });

    it('updates the row it just created when a key repeats inside one batch', async () => {
      mockApifyService.getTikTokVideos.mockResolvedValue([
        { externalId: 'a', title: 'first' },
        { externalId: 'a', title: 'second' },
      ]);
      mockPrisma.trendingVideo.findMany.mockResolvedValue([]);

      await service.fetchAndCacheViralVideos('tiktok', 2);

      expect(mockPrisma.trendingVideo.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trendingVideo.update).toHaveBeenCalledWith({
        data: { data: expect.objectContaining({ title: 'second' }) },
        where: { id: 'created-video' },
      });
    });

    it('skips the read entirely when the provider returns nothing', async () => {
      mockApifyService.getTikTokVideos.mockResolvedValue([]);

      await service.fetchAndCacheViralVideos('tiktok', 5);

      expect(mockPrisma.trendingVideo.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.trendingVideo.create).not.toHaveBeenCalled();
    });
  });

  describe('fetchAndCacheHashtags', () => {
    it('reads existing hashtags once for the whole batch and updates the match', async () => {
      mockApifyService.getTrendingHashtags.mockResolvedValue([
        { hashtag: '#one' },
        { hashtag: '#two' },
        { hashtag: '#three' },
      ]);
      mockPrisma.trendingHashtag.findMany.mockResolvedValue([
        {
          ...makeHashtagDoc({ hashtag: '#two', platform: 'tiktok' }),
          id: 'hashtag-two',
        },
      ]);

      await service.fetchAndCacheHashtags('tiktok', 3);

      expect(mockPrisma.trendingHashtag.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trendingHashtag.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trendingHashtag.update).toHaveBeenCalledWith({
        data: { data: expect.objectContaining({ hashtag: '#two' }) },
        where: { id: 'hashtag-two' },
      });
      expect(mockPrisma.trendingHashtag.create).toHaveBeenCalledTimes(2);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('creates a new hashtag when no existing record matches', async () => {
      mockApifyService.getTrendingHashtags.mockResolvedValue([
        { hashtag: '#one' },
      ]);
      mockPrisma.trendingHashtag.findMany.mockResolvedValue([
        {
          ...makeHashtagDoc({ hashtag: '#one', platform: 'instagram' }),
          id: 'hashtag-instagram',
        },
      ]);

      await service.fetchAndCacheHashtags('tiktok', 1);

      expect(mockPrisma.trendingHashtag.update).not.toHaveBeenCalled();
      expect(mockPrisma.trendingHashtag.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchAndCacheSounds', () => {
    it('reads existing sounds once for the whole batch and updates the match', async () => {
      mockApifyService.getTikTokSounds.mockResolvedValue([
        { soundId: 's1' },
        { soundId: 's2' },
        { soundId: 's3' },
      ]);
      mockPrisma.trendingSound.findMany.mockResolvedValue([
        { ...makeSoundDoc({ soundId: 's2' }), id: 'sound-two' },
      ]);

      await service.fetchAndCacheSounds(3);

      expect(mockPrisma.trendingSound.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trendingSound.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trendingSound.update).toHaveBeenCalledWith({
        data: { data: expect.objectContaining({ soundId: 's2' }) },
        where: { id: 'sound-two' },
      });
      expect(mockPrisma.trendingSound.create).toHaveBeenCalledTimes(2);
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('creates a new sound when no existing record matches', async () => {
      mockApifyService.getTikTokSounds.mockResolvedValue([{ soundId: 's1' }]);
      mockPrisma.trendingSound.findMany.mockResolvedValue([]);

      await service.fetchAndCacheSounds(1);

      expect(mockPrisma.trendingSound.update).not.toHaveBeenCalled();
      expect(mockPrisma.trendingSound.create).toHaveBeenCalledTimes(1);
    });
  });
});
