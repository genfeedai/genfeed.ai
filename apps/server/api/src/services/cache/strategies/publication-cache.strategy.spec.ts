import { CacheService } from '@api/services/cache/cache.service';
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

  describe('cachePublications', () => {
    it('passes empty array of posts without error', async () => {
      cacheService.set.mockResolvedValue(true);
      await expect(
        strategy.cachePublications(userId, videoId, []),
      ).resolves.toBe(true);
    });
  });

  describe('getPublications', () => {
    it('returns cached posts when they exist', async () => {
      const cached = [{ id: 'p1' }, { id: 'p2' }];
      cacheService.get.mockResolvedValue(cached);

      const result = await strategy.getPublications(userId, videoId);
      expect(result).toEqual(cached);
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
