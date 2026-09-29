import { CacheService } from '@api/services/cache/cache.service';
import { UserCacheStrategy } from '@api/services/cache/strategies/user-cache.strategy';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@api/services/cache/cache.service');

describe('UserCacheStrategy', () => {
  let strategy: UserCacheStrategy;
  let cacheService: vi.Mocked<CacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserCacheStrategy,
        {
          provide: CacheService,
          useValue: {
            generateKey: vi.fn(),
            get: vi.fn(),
            invalidateByTags: vi.fn(),
            set: vi.fn(),
          },
        },
      ],
    }).compile();

    strategy = module.get<UserCacheStrategy>(UserCacheStrategy);
    cacheService = module.get(CacheService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('cacheUser', () => {
    it('should generate key and set cache with user tags and 1h TTL', async () => {
      cacheService.generateKey.mockReturnValue('user:user-123');
      cacheService.set.mockResolvedValue(true);

      const userData = { email: 'test@example.com', name: 'Test User' };
      const result = await strategy.cacheUser('user-123', userData);

      expect(cacheService.generateKey).toHaveBeenCalledWith('user', 'user-123');
      expect(cacheService.set).toHaveBeenCalledWith('user:user-123', userData, {
        tags: ['users', 'user:user-123'],
        ttl: 3600,
      });
      expect(result).toBe(true);
    });

    it('should tag with both global users tag and per-user tag', async () => {
      cacheService.generateKey.mockReturnValue('user:abc');
      cacheService.set.mockResolvedValue(true);

      await strategy.cacheUser('abc', {});

      const setCall = cacheService.set.mock.calls[0];
      const options = setCall[2] as { tags: string[]; ttl: number };
      expect(options.tags).toContain('users');
      expect(options.tags).toContain('user:abc');
    });
  });

  describe('getUser', () => {
    it('should generate key and get from cache', async () => {
      const userData = { email: 'test@example.com' };
      cacheService.generateKey.mockReturnValue('user:user-123');
      cacheService.get.mockResolvedValue(userData);

      const result = await strategy.getUser('user-123');

      expect(cacheService.generateKey).toHaveBeenCalledWith('user', 'user-123');
      expect(cacheService.get).toHaveBeenCalledWith('user:user-123');
      expect(result).toEqual(userData);
    });
  });

  describe('invalidate', () => {
    it('should invalidate by per-user tag', async () => {
      cacheService.invalidateByTags.mockResolvedValue(3);

      const result = await strategy.invalidate('user-123');

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'user:user-123',
      ]);
      expect(result).toBe(3);
    });

    it('should only invalidate per-user tag, not global users tag', async () => {
      cacheService.invalidateByTags.mockResolvedValue(1);

      await strategy.invalidate('user-abc');

      const tags = cacheService.invalidateByTags.mock.calls[0][0];
      expect(tags).toEqual(['user:user-abc']);
      expect(tags).not.toContain('users');
    });
  });
});
