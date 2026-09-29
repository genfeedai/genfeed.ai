import { CacheService } from '@api/services/cache/cache.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { VoteCacheStrategy } from './vote-cache.strategy';

describe('VoteCacheStrategy', () => {
  let strategy: VoteCacheStrategy;

  let mockCacheService: {
    generateKey: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockCacheService = {
      generateKey: vi.fn().mockReturnValue('votes:Entity:entity-123'),
      get: vi.fn().mockResolvedValue(null),
      invalidateByTags: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoteCacheStrategy,
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    strategy = module.get<VoteCacheStrategy>(VoteCacheStrategy);
  });

  describe('cacheVoteCount', () => {
    it('should generate a key and set the vote count in cache', async () => {
      const result = await strategy.cacheVoteCount('entity-123', 'Post', 42);

      expect(mockCacheService.generateKey).toHaveBeenCalledWith(
        'votes',
        'Post',
        'entity-123',
      );
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'votes:Entity:entity-123',
        expect.objectContaining({ count: 42 }),
        expect.objectContaining({ tags: expect.any(Array), ttl: 120 }),
      );
      expect(result).toBe(true);
    });

    it('should store a lastUpdated timestamp alongside the count', async () => {
      const before = Date.now();
      await strategy.cacheVoteCount('entity-123', 'Post', 10);
      const after = Date.now();

      const setCalls = mockCacheService.set.mock.calls[0];
      const storedValue = setCalls[1] as { count: number; lastUpdated: number };

      expect(storedValue.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(storedValue.lastUpdated).toBeLessThanOrEqual(after);
    });

    it('should tag with "votes" and the entity-specific tag', async () => {
      await strategy.cacheVoteCount('entity-abc', 'Comment', 5);

      const setCalls = mockCacheService.set.mock.calls[0];
      const options = setCalls[2] as { tags: string[]; ttl: number };

      expect(options.tags).toContain('votes');
      expect(options.tags).toContain('comment:entity-abc');
    });
  });

  describe('getVoteCount', () => {
    it('should build the cache key using generateKey', async () => {
      mockCacheService.get.mockResolvedValue(null);

      await strategy.getVoteCount('entity-456', 'Video');

      expect(mockCacheService.generateKey).toHaveBeenCalledWith(
        'votes',
        'Video',
        'entity-456',
      );
    });

    it('should return 0 when count is 0', async () => {
      mockCacheService.get.mockResolvedValue({ count: 0, lastUpdated: 1000 });

      const result = await strategy.getVoteCount('entity-0', 'Post');

      expect(result).toBe(0);
    });
  });

  describe('invalidate', () => {
    it('should invalidate by votes:<entityId> tag', async () => {
      const result = await strategy.invalidate('entity-123');

      expect(mockCacheService.invalidateByTags).toHaveBeenCalledWith([
        'votes:entity-123',
      ]);
      expect(result).toBe(1);
    });
  });
});
