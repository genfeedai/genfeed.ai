import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { CacheTagsService } from '@api/services/cache/services/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('CacheInvalidationService', () => {
  let service: CacheInvalidationService;

  const mockScan = vi.fn();
  const mockUnlink = vi.fn();

  const mockRedisClient = {
    scan: mockScan,
    unlink: mockUnlink,
  };

  const mockCacheClientService = {
    get instance() {
      return mockRedisClient;
    },
  };

  const mockCacheTagsService = {
    invalidateByTags: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheInvalidationService,
        {
          provide: CacheClientService,
          useValue: mockCacheClientService,
        },
        {
          provide: CacheTagsService,
          useValue: mockCacheTagsService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<CacheInvalidationService>(CacheInvalidationService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invalidate', () => {
    it('should call redis.unlink with the provided keys', async () => {
      mockUnlink.mockResolvedValue(2);

      await service.invalidate('brands:list:org1', 'brands:single:id1');

      expect(mockUnlink).toHaveBeenCalledWith([
        'brands:list:org1',
        'brands:single:id1',
      ]);
    });

    it('should not call redis.unlink when no keys are provided', async () => {
      await service.invalidate();

      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should not throw and should log on redis error', async () => {
      const error = new Error('Redis unavailable');
      mockUnlink.mockRejectedValue(error);

      await expect(service.invalidate('some:key')).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('invalidatePattern', () => {
    it('should scan and unlink all keys matching the pattern', async () => {
      mockScan
        .mockResolvedValueOnce({
          cursor: '42',
          keys: ['brands:list:org1', 'brands:list:org2'],
        })
        .mockResolvedValueOnce({ cursor: '0', keys: ['brands:list:org3'] });
      mockUnlink.mockResolvedValue(1);

      await service.invalidatePattern('brands:list:*');

      expect(mockScan).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenNthCalledWith(1, [
        'brands:list:org1',
        'brands:list:org2',
      ]);
      expect(mockUnlink).toHaveBeenNthCalledWith(2, ['brands:list:org3']);
    });

    it('should stop scanning when cursor returns 0', async () => {
      mockScan.mockResolvedValueOnce({ cursor: '0', keys: [] });

      await service.invalidatePattern('brands:*');

      expect(mockScan).toHaveBeenCalledTimes(1);
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should skip unlink when a scan page returns no keys', async () => {
      mockScan
        .mockResolvedValueOnce({ cursor: '5', keys: [] })
        .mockResolvedValueOnce({ cursor: '0', keys: ['brands:list:org1'] });
      mockUnlink.mockResolvedValue(1);

      await service.invalidatePattern('brands:list:*');

      expect(mockUnlink).toHaveBeenCalledTimes(1);
      expect(mockUnlink).toHaveBeenCalledWith(['brands:list:org1']);
    });

    it('should not throw and should log on redis error', async () => {
      const error = new Error('Redis unavailable');
      mockScan.mockRejectedValue(error);

      await expect(
        service.invalidatePattern('brands:*'),
      ).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('invalidateByTags', () => {
    it('should delegate to CacheTagsService and return count', async () => {
      mockCacheTagsService.invalidateByTags.mockResolvedValue(5);

      const count = await service.invalidateByTags(['user', 'profile']);

      expect(mockCacheTagsService.invalidateByTags).toHaveBeenCalledWith([
        'user',
        'profile',
      ]);
      expect(count).toBe(5);
    });

    it('should return 0 and log on error', async () => {
      mockCacheTagsService.invalidateByTags.mockRejectedValue(
        new Error('Redis unavailable'),
      );

      const count = await service.invalidateByTags(['user']);

      expect(count).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('invalidateForUser', () => {
    it('should invalidate with user tag', async () => {
      mockCacheTagsService.invalidateByTags.mockResolvedValue(3);

      await service.invalidateForUser('user-123');

      expect(mockCacheTagsService.invalidateByTags).toHaveBeenCalledWith([
        'user:user-123',
      ]);
    });
  });

  describe('invalidateForController', () => {
    it('should invalidate with lowercased controller name', async () => {
      mockCacheTagsService.invalidateByTags.mockResolvedValue(10);

      await service.invalidateForController('UserController');

      expect(mockCacheTagsService.invalidateByTags).toHaveBeenCalledWith([
        'usercontroller',
      ]);
    });
  });
});
