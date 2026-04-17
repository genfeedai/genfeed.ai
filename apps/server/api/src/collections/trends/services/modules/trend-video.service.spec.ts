import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { Timeframe } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TrendVideoService', () => {
  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
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

  let mockPrisma: {
    trendingHashtag: { findMany: ReturnType<typeof vi.fn> };
    trendingSound: { findMany: ReturnType<typeof vi.fn> };
    trendingVideo: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
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
        findMany: vi.fn().mockResolvedValue([]),
      },
      trendingSound: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      trendingVideo: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);

    service = new TrendVideoService(
      mockPrisma as never,
      mockLoggerService as never,
      mockCacheService as never,
      mockApifyService as never,
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
});
