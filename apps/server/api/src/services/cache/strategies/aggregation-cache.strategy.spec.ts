/**
 * @fileoverview Tests for AggregationCacheStrategy
 */

import { CacheService } from '@api/services/cache/cache.service';
import { AggregationCacheStrategy } from '@api/services/cache/strategies/aggregation-cache.strategy';
import { Test, TestingModule } from '@nestjs/testing';

describe('AggregationCacheStrategy', () => {
  let strategy: AggregationCacheStrategy;
  let cacheService: vi.Mocked<CacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregationCacheStrategy,
        {
          provide: CacheService,
          useValue: {
            generateKey: vi.fn((...parts: string[]) => parts.join(':')),
            get: vi.fn(),
            set: vi.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<AggregationCacheStrategy>(AggregationCacheStrategy);
    cacheService = module.get(CacheService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('cacheAggregation', () => {
    it('should call cacheService.set with aggregation key, default tags, and ttl 180', async () => {
      cacheService.set.mockResolvedValue(true);
      const result = await strategy.cacheAggregation('analytics', 'hash-abc', {
        count: 42,
      });

      expect(cacheService.generateKey).toHaveBeenCalledWith(
        'aggregation',
        'analytics',
        'hash-abc',
      );
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        { count: 42 },
        expect.objectContaining({
          tags: ['aggregations'],
          ttl: 180,
        }),
      );
      expect(result).toBe(true);
    });
  });

  describe('getAggregation', () => {
    it('should build key using namespace + hash', async () => {
      cacheService.get.mockResolvedValue(null);

      await strategy.getAggregation('reports', 'hash-999');

      expect(cacheService.generateKey).toHaveBeenCalledWith(
        'aggregation',
        'reports',
        'hash-999',
      );
    });
  });

  describe('generateQueryHash', () => {
    it('should return a base64-encoded string', () => {
      const query = { org: 'org1', status: 'published' };
      const hash = strategy.generateQueryHash(query);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
      // Verify it's valid base64
      expect(() => Buffer.from(hash, 'base64').toString('utf-8')).not.toThrow();
    });
  });
});
