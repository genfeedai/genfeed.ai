import { CacheService } from '@api/services/cache/cache.service';
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

  describe('cacheBrand', () => {
    it('sets brand data with correct key and tags', async () => {
      cacheService.generateKey.mockReturnValue('cache:brand:brand-123');
      cacheService.set.mockResolvedValue(true);

      const brandData = { name: 'Acme', userId: 'user-1' };
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
  });
});
