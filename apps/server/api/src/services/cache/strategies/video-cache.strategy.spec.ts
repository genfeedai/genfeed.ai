/**
 * @fileoverview Tests for VideoCacheStrategy
 */

import { CacheService } from '@api/services/cache/services/cache.service';
import { VideoCacheStrategy } from '@api/services/cache/strategies/video-cache.strategy';
import { Test, TestingModule } from '@nestjs/testing';

describe('VideoCacheStrategy', () => {
  let strategy: VideoCacheStrategy;
  let cacheService: vi.Mocked<CacheService>;

  const mockUserId = 'user-abc-123';
  const mockVideoId = 'video-xyz-456';
  const mockFilters = { category: 'video', status: 'published' };
  const mockVideos = [
    { id: 'v1', title: 'Test' },
    { id: 'v2', title: 'Test 2' },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoCacheStrategy,
        {
          provide: CacheService,
          useValue: {
            generateKey: vi.fn((...parts: string[]) => parts.join(':')),
            get: vi.fn(),
            invalidateByTags: vi.fn(),
            set: vi.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<VideoCacheStrategy>(VideoCacheStrategy);
    cacheService = module.get(CacheService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('cacheVideoList', () => {
    it('should call cacheService.set with sorted filter key, tags, and ttl 300', async () => {
      cacheService.set.mockResolvedValue(true);

      const result = await strategy.cacheVideoList(
        mockUserId,
        mockFilters,
        1,
        20,
        mockVideos,
      );

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        mockVideos,
        expect.objectContaining({
          tags: expect.arrayContaining([
            'videos',
            `user:${mockUserId}`,
            'video-lists',
          ]),
          ttl: 300,
        }),
      );
      expect(result).toBe(true);
    });

    it('should sort filter keys deterministically', async () => {
      cacheService.set.mockResolvedValue(true);
      await strategy.cacheVideoList(mockUserId, { a: '2', z: '1' }, 1, 10, []);
      await strategy.cacheVideoList(mockUserId, { a: '2', z: '1' }, 1, 10, []);

      const [firstCall, secondCall] = cacheService.set.mock.calls;
      expect(firstCall[0]).toEqual(secondCall[0]);
    });
  });

  describe('getVideoList', () => {
    it('should return cached array when cache hit', async () => {
      cacheService.get.mockResolvedValue(mockVideos as never);

      const result = await strategy.getVideoList(
        mockUserId,
        mockFilters,
        1,
        20,
      );

      expect(result).toEqual(mockVideos);
      expect(cacheService.get).toHaveBeenCalledWith(expect.any(String));
    });

    it('should return empty array on cache miss (null)', async () => {
      cacheService.get.mockResolvedValue(null);

      const result = await strategy.getVideoList(
        mockUserId,
        mockFilters,
        1,
        20,
      );

      expect(result).toEqual([]);
    });
  });

  describe('cacheVideo', () => {
    it('should call cacheService.set with video-specific tags and ttl 900', async () => {
      cacheService.set.mockResolvedValue(true);
      const videoData = { brand: 'brand1', title: 'Test Video', user: 'user1' };

      const result = await strategy.cacheVideo(mockVideoId, videoData);

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        videoData,
        expect.objectContaining({
          tags: expect.arrayContaining([
            'videos',
            `video:${mockVideoId}`,
            `user:${videoData.user}`,
            `brand:${videoData.brand}`,
          ]),
          ttl: 900,
        }),
      );
      expect(result).toBe(true);
    });

    it('should use generateKey to build video key', async () => {
      cacheService.set.mockResolvedValue(true);
      await strategy.cacheVideo(mockVideoId, { brand: 'b', user: 'u' });

      expect(cacheService.generateKey).toHaveBeenCalledWith(
        'video',
        mockVideoId,
      );
    });
  });

  describe('getVideo', () => {
    it('should return video data on cache hit', async () => {
      const cachedData = { id: mockVideoId, title: 'Cached Video' };
      cacheService.get.mockResolvedValue(cachedData as never);

      const result = await strategy.getVideo(mockVideoId);

      expect(result).toEqual(cachedData);
    });

    it('should return null on cache miss', async () => {
      cacheService.get.mockResolvedValue(null);

      const result = await strategy.getVideo(mockVideoId);

      expect(result).toBeNull();
    });
  });

  describe('invalidateVideo', () => {
    it('should invalidate by video-specific tag', async () => {
      cacheService.invalidateByTags.mockResolvedValue(3);

      const result = await strategy.invalidateVideo(mockVideoId);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        `video:${mockVideoId}`,
      ]);
      expect(result).toBe(3);
    });
  });

  describe('invalidateVideoLists', () => {
    it('should invalidate video-lists tag when no userId provided', async () => {
      cacheService.invalidateByTags.mockResolvedValue(5);

      await strategy.invalidateVideoLists();

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'video-lists',
      ]);
    });

    it('should include user tag when userId is provided', async () => {
      cacheService.invalidateByTags.mockResolvedValue(2);

      await strategy.invalidateVideoLists(mockUserId);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'video-lists',
        `user:${mockUserId}`,
      ]);
    });
  });
});
