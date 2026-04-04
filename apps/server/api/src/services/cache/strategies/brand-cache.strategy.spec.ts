import { CacheService } from '@api/services/cache/services/cache.service';
import { BrandCacheStrategy } from '@api/services/cache/strategies/brand-cache.strategy';
import { Test, TestingModule } from '@nestjs/testing';

describe('BrandCacheStrategy', () => {
  let strategy: BrandCacheStrategy;
  let cacheService: {
    generateKey: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    cacheService = {
      generateKey: vi.fn(),
      get: vi.fn(),
      invalidateByTags: vi.fn(),
      set: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandCacheStrategy,
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    strategy = module.get(BrandCacheStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('cacheBrand', () => {
    it('sets brand data with correct key and tags', async () => {
      cacheService.generateKey.mockReturnValue('cache:brand:brand-123');
      cacheService.set.mockResolvedValue(true);

      const brandData = { name: 'Acme', user: 'user-1' };
      const result = await strategy.cacheBrand('brand-123', brandData);

      expect(cacheService.generateKey).toHaveBeenCalledWith(
        'brand',
        'brand-123',
      );
      expect(cacheService.set).toHaveBeenCalledWith(
        'cache:brand:brand-123',
        brandData,
        {
          tags: ['brands', 'brand:brand-123', 'user:user-1'],
          ttl: 1800,
        },
      );
      expect(result).toBe(true);
    });

    it('returns false when cache.set fails', async () => {
      cacheService.generateKey.mockReturnValue('cache:brand:brand-456');
      cacheService.set.mockResolvedValue(false);

      const result = await strategy.cacheBrand('brand-456', { user: 'u2' });
      expect(result).toBe(false);
    });

    it('includes user tag from brand data', async () => {
      cacheService.generateKey.mockReturnValue('k');
      cacheService.set.mockResolvedValue(true);

      await strategy.cacheBrand('b1', { extra: 'data', user: 'my-user' });

      const callArgs = cacheService.set.mock.calls[0];
      expect(callArgs[2].tags).toContain('user:my-user');
    });

    it('always sets 30-minute TTL', async () => {
      cacheService.generateKey.mockReturnValue('k');
      cacheService.set.mockResolvedValue(true);

      await strategy.cacheBrand('b2', { user: 'u' });

      expect(cacheService.set.mock.calls[0][2].ttl).toBe(1800);
    });
  });

  describe('getBrand', () => {
    it('retrieves value by generated key', async () => {
      cacheService.generateKey.mockReturnValue('cache:brand:brand-789');
      cacheService.get.mockResolvedValue({ name: 'TestBrand', user: 'u3' });

      const result = await strategy.getBrand<{ user: string; name: string }>(
        'brand-789',
      );

      expect(cacheService.generateKey).toHaveBeenCalledWith(
        'brand',
        'brand-789',
      );
      expect(cacheService.get).toHaveBeenCalledWith('cache:brand:brand-789');
      expect(result).toEqual({ name: 'TestBrand', user: 'u3' });
    });

    it('returns null on cache miss', async () => {
      cacheService.generateKey.mockReturnValue('cache:brand:missing');
      cacheService.get.mockResolvedValue(null);

      const result = await strategy.getBrand('missing');
      expect(result).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('invalidates brand-specific tag', async () => {
      cacheService.invalidateByTags.mockResolvedValue(3);

      const result = await strategy.invalidate('brand-999');

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'brand:brand-999',
      ]);
      expect(result).toBe(3);
    });

    it('returns 0 when no keys were invalidated', async () => {
      cacheService.invalidateByTags.mockResolvedValue(0);

      const result = await strategy.invalidate('brand-empty');
      expect(result).toBe(0);
    });
  });
});
