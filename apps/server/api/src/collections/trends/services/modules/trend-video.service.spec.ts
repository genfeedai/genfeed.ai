import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { Timeframe } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LeanQueryResult<T> = {
  lean: ReturnType<typeof vi.fn>;
};

function createFindChain<T>(value: T[]): {
  limit: ReturnType<typeof vi.fn>;
  sort: ReturnType<typeof vi.fn>;
} & LeanQueryResult<T> {
  const lean = vi.fn().mockResolvedValue(value);
  const limit = vi.fn().mockReturnValue({ lean });
  const sort = vi.fn().mockReturnValue({ lean, limit });

  return { lean, limit, sort };
}

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

  let mockTrendingVideoModel: {
    find: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let mockTrendingHashtagModel: {
    find: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let mockTrendingSoundModel: {
    find: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  let service: TrendVideoService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTrendingVideoModel = {
      find: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(),
    };
    mockTrendingHashtagModel = {
      find: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(),
    };
    mockTrendingSoundModel = {
      find: vi.fn(),
      findOneAndUpdate: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(),
    };

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);

    service = new TrendVideoService(
      mockTrendingVideoModel as never,
      mockTrendingHashtagModel as never,
      mockTrendingSoundModel as never,
      mockLoggerService as never,
      mockCacheService as never,
      mockApifyService as never,
    );
  });

  it('returns empty viral videos when the database is empty without triggering Apify', async () => {
    mockTrendingVideoModel.find.mockReturnValueOnce(createFindChain([]));

    const result = await service.getViralVideos({
      limit: 10,
      timeframe: Timeframe.H24,
    });

    expect(result).toEqual([]);
    expect(mockApifyService.getTikTokVideos).not.toHaveBeenCalled();
    expect(mockTrendingVideoModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockTrendingVideoModel.find).toHaveBeenCalledTimes(1);
  });

  it('does not fetch viral videos on demand when the database already has data', async () => {
    mockTrendingVideoModel.find.mockReturnValue(
      createFindChain([
        {
          externalId: 'video-1',
          id: 'video-1',
          platform: 'tiktok',
          title: 'Trend video',
          viralScore: 88,
        },
      ]),
    );

    const result = await service.getViralVideos({ limit: 10 });

    expect(result).toHaveLength(1);
    expect(mockApifyService.getTikTokVideos).not.toHaveBeenCalled();
    expect(mockTrendingVideoModel.find).toHaveBeenCalledTimes(1);
  });

  it('returns empty hashtags when the database is empty without triggering Apify', async () => {
    mockTrendingHashtagModel.find.mockReturnValueOnce(createFindChain([]));

    const result = await service.getTrendingHashtags({ limit: 10 });

    expect(result).toEqual([]);
    expect(mockApifyService.getTrendingHashtags).not.toHaveBeenCalled();
    expect(mockTrendingHashtagModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockTrendingHashtagModel.find).toHaveBeenCalledTimes(1);
  });

  it('returns empty sounds when the database is empty without triggering Apify', async () => {
    mockTrendingSoundModel.find.mockReturnValueOnce(createFindChain([]));

    const result = await service.getTrendingSounds({ limit: 10 });

    expect(result).toEqual([]);
    expect(mockApifyService.getTikTokSounds).not.toHaveBeenCalled();
    expect(mockTrendingSoundModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockTrendingSoundModel.find).toHaveBeenCalledTimes(1);
  });
});
