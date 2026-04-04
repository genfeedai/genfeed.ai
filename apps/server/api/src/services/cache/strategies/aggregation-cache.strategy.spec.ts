/**
 * @fileoverview Tests for AggregationCacheStrategy
 */

import { CacheService } from '@api/services/cache/services/cache.service';
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

  it('should be defined', () => {
    expect(strategy).toBeDefined();
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

    it('should merge extra tags with default aggregations tag', async () => {
      cacheService.set.mockResolvedValue(true);

      await strategy.cacheAggregation('metrics', 'hash-xyz', { total: 99 }, [
        'brand:123',
        'org:456',
      ]);

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        { total: 99 },
        expect.objectContaining({
          tags: ['aggregations', 'brand:123', 'org:456'],
        }),
      );
    });

    it('should return false when set fails', async () => {
      cacheService.set.mockResolvedValue(false);

      const result = await strategy.cacheAggregation('ns', 'h', {});

      expect(result).toBe(false);
    });
  });

  describe('getAggregation', () => {
    it('should return cached result on hit', async () => {
      cacheService.get.mockResolvedValue({ count: 7 } as never);

      const result = await strategy.getAggregation<{ count: number }>(
        'analytics',
        'hash-abc',
      );

      expect(result).toEqual({ count: 7 });
    });

    it('should return null on cache miss', async () => {
      cacheService.get.mockResolvedValue(null);

      const result = await strategy.getAggregation('analytics', 'hash-abc');

      expect(result).toBeNull();
    });

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

    it('should produce the same hash for same query', () => {
      const query = { brand: 'b1', status: 'active' };
      const hash1 = strategy.generateQueryHash(query);
      const hash2 = strategy.generateQueryHash(query);

      expect(hash1).toEqual(hash2);
    });

    it('should produce different hashes for different queries', () => {
      const hash1 = strategy.generateQueryHash({ a: 1 });
      const hash2 = strategy.generateQueryHash({ a: 2 });

      expect(hash1).not.toEqual(hash2);
    });

    it('should round-trip JSON through base64 correctly', () => {
      const query = { filters: ['x', 'y'], page: 2 };
      const hash = strategy.generateQueryHash(query);
      const decoded = JSON.parse(Buffer.from(hash, 'base64').toString('utf-8'));

      expect(decoded).toEqual(query);
    });
  });
});
