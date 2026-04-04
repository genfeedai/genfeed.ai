import { CacheService } from '@api/services/cache/services/cache.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { PublicationCacheStrategy } from './publication-cache.strategy';

describe('PublicationCacheStrategy', () => {
  let strategy: PublicationCacheStrategy;
  let cacheService: vi.Mocked<CacheService>;

  const userId = 'user-abc';
  const videoId = 'video-xyz';
  const generatedKey = 'posts:user-abc:video-xyz';

  beforeEach(async () => {
    cacheService = {
      generateKey: vi.fn().mockReturnValue(generatedKey),
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as vi.Mocked<CacheService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicationCacheStrategy,
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    strategy = module.get<PublicationCacheStrategy>(PublicationCacheStrategy);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('cachePublications', () => {
    it('generates a cache key with correct prefix and ids', async () => {
      cacheService.set.mockResolvedValue(true);
      await strategy.cachePublications(userId, videoId, []);
      expect(cacheService.generateKey).toHaveBeenCalledWith(
        'posts',
        userId,
        videoId,
      );
    });

    it('stores posts with correct TTL and tags', async () => {
      const posts = [{ id: 'p1' }, { id: 'p2' }];
      cacheService.set.mockResolvedValue(true);

      await strategy.cachePublications(userId, videoId, posts);

      expect(cacheService.set).toHaveBeenCalledWith(generatedKey, posts, {
        tags: ['posts', `user:${userId}`, `video:${videoId}`],
        ttl: 600,
      });
    });

    it('returns true when cache set succeeds', async () => {
      cacheService.set.mockResolvedValue(true);
      const result = await strategy.cachePublications(userId, videoId, []);
      expect(result).toBe(true);
    });

    it('returns false when cache set fails', async () => {
      cacheService.set.mockResolvedValue(false);
      const result = await strategy.cachePublications(userId, videoId, []);
      expect(result).toBe(false);
    });

    it('propagates errors from cacheService.set', async () => {
      cacheService.set.mockRejectedValue(new Error('Redis down'));
      await expect(
        strategy.cachePublications(userId, videoId, []),
      ).rejects.toThrow('Redis down');
    });

    it('passes empty array of posts without error', async () => {
      cacheService.set.mockResolvedValue(true);
      await expect(
        strategy.cachePublications(userId, videoId, []),
      ).resolves.toBe(true);
    });
  });

  describe('getPublications', () => {
    it('generates cache key with correct prefix and ids', async () => {
      cacheService.get.mockResolvedValue(['p1', 'p2']);
      await strategy.getPublications(userId, videoId);
      expect(cacheService.generateKey).toHaveBeenCalledWith(
        'posts',
        userId,
        videoId,
      );
    });

    it('returns cached posts when they exist', async () => {
      const cached = [{ id: 'p1' }, { id: 'p2' }];
      cacheService.get.mockResolvedValue(cached);

      const result = await strategy.getPublications(userId, videoId);
      expect(result).toEqual(cached);
    });

    it('returns empty array when cache miss (null)', async () => {
      cacheService.get.mockResolvedValue(null);
      const result = await strategy.getPublications(userId, videoId);
      expect(result).toEqual([]);
    });

    it('returns empty array when cache miss (undefined)', async () => {
      cacheService.get.mockResolvedValue(undefined);
      const result = await strategy.getPublications(userId, videoId);
      expect(result).toEqual([]);
    });

    it('propagates errors from cacheService.get', async () => {
      cacheService.get.mockRejectedValue(new Error('Redis timeout'));
      await expect(strategy.getPublications(userId, videoId)).rejects.toThrow(
        'Redis timeout',
      );
    });
  });
});
