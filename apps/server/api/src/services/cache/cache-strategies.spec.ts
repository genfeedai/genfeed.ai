import { CacheStrategies } from '@api/services/cache/cache-strategies';
import { CacheService } from '@api/services/cache/services/cache.service';
import { AggregationCacheStrategy } from '@api/services/cache/strategies/aggregation-cache.strategy';
import { BrandCacheStrategy } from '@api/services/cache/strategies/brand-cache.strategy';
import { PublicationCacheStrategy } from '@api/services/cache/strategies/publication-cache.strategy';
import { UserCacheStrategy } from '@api/services/cache/strategies/user-cache.strategy';
import { VideoCacheStrategy } from '@api/services/cache/strategies/video-cache.strategy';
import { VoteCacheStrategy } from '@api/services/cache/strategies/vote-cache.strategy';

describe('CacheStrategies', () => {
  const cacheService = {
    generateKey: vi.fn(),
    get: vi.fn(),
    invalidateByTags: vi.fn(),
    set: vi.fn(),
  } as unknown as CacheService;

  it('should be constructed with scoped strategy helpers', () => {
    const strategies = new CacheStrategies(
      new UserCacheStrategy(cacheService),
      new BrandCacheStrategy(cacheService),
      new VideoCacheStrategy(cacheService),
      new VoteCacheStrategy(cacheService),
      new PublicationCacheStrategy(cacheService),
      new AggregationCacheStrategy(cacheService),
    );

    expect(strategies).toBeDefined();
    expect(typeof strategies.cacheUser).toBe('function');
    expect(typeof strategies.cacheAggregation).toBe('function');
  });
});
