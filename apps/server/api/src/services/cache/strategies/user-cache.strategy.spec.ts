import { CacheService } from '@api/services/cache/services/cache.service';
import { UserCacheStrategy } from '@api/services/cache/strategies/user-cache.strategy';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@api/services/cache/services/cache.service');

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

  it('should be defined', () => {
    expect(strategy).toBeDefined();
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

    it('should return false when cache set fails', async () => {
      cacheService.generateKey.mockReturnValue('user:user-456');
      cacheService.set.mockResolvedValue(false);

      const result = await strategy.cacheUser('user-456', { name: 'Jane' });
      expect(result).toBe(false);
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

    it('should use 3600 second TTL (1 hour)', async () => {
      cacheService.generateKey.mockReturnValue('user:xyz');
      cacheService.set.mockResolvedValue(true);

      await strategy.cacheUser('xyz', {});

      const setCall = cacheService.set.mock.calls[0];
      const options = setCall[2] as { tags: string[]; ttl: number };
      expect(options.ttl).toBe(3600);
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

    it('should return null when user is not in cache', async () => {
      cacheService.generateKey.mockReturnValue('user:missing');
      cacheService.get.mockResolvedValue(null);

      const result = await strategy.getUser('missing');
      expect(result).toBeNull();
    });

    it('should support generic type parameter', async () => {
      interface UserData {
        email: string;
        role: string;
      }
      const userData: UserData = { email: 'test@test.com', role: 'admin' };
      cacheService.generateKey.mockReturnValue('user:typed');
      cacheService.get.mockResolvedValue(userData);

      const result = await strategy.getUser<UserData>('typed');
      expect(result?.role).toBe('admin');
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

    it('should return number of invalidated entries', async () => {
      cacheService.invalidateByTags.mockResolvedValue(0);

      const result = await strategy.invalidate('no-entries-user');
      expect(result).toBe(0);
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
