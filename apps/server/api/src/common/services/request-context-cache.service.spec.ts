import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('RequestContextCacheService', () => {
  let service: RequestContextCacheService;

  const mockSMembers = vi.fn();
  const mockUnlink = vi.fn();
  const mockScanIterator = vi.fn();

  const mockPublisher = {
    scanIterator: mockScanIterator,
    sMembers: mockSMembers,
    unlink: mockUnlink,
  };

  const mockRedisService = {
    getPublisher: vi.fn().mockReturnValue(mockPublisher),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestContextCacheService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<RequestContextCacheService>(
      RequestContextCacheService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invalidateForUser', () => {
    it('should do nothing when publisher is unavailable', async () => {
      mockRedisService.getPublisher.mockReturnValueOnce(null);

      await service.invalidateForUser('user_123');

      expect(mockSMembers).not.toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should unlink all cached keys and the set key when keys exist', async () => {
      const clerkId = 'user_abc';
      const cachedKeys = ['rc:user_abc:org1', 'rc:user_abc:org2'];
      mockSMembers.mockResolvedValue(cachedKeys);
      mockUnlink.mockResolvedValue(3);

      await service.invalidateForUser(clerkId);

      expect(mockSMembers).toHaveBeenCalledWith('rc:keys:user_abc');
      expect(mockUnlink).toHaveBeenCalledWith([
        ...cachedKeys,
        'rc:keys:user_abc',
      ]);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should unlink only the set key when no cached keys exist', async () => {
      const clerkId = 'user_empty';
      mockSMembers.mockResolvedValue([]);
      mockUnlink.mockResolvedValue(1);

      await service.invalidateForUser(clerkId);

      expect(mockUnlink).toHaveBeenCalledWith('rc:keys:user_empty');
    });

    it('should log an error when sMembers throws', async () => {
      const clerkId = 'user_error';
      const error = new Error('Redis connection lost');
      mockSMembers.mockRejectedValue(error);

      await service.invalidateForUser(clerkId);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(clerkId),
        error,
        expect.any(Object),
      );
    });
  });

  describe('invalidateForOrganization', () => {
    it('should do nothing when publisher is unavailable', async () => {
      mockRedisService.getPublisher.mockReturnValueOnce(null);

      await service.invalidateForOrganization('org_123');

      expect(mockScanIterator).not.toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should scan and unlink all keys matching the org pattern', async () => {
      const orgId = 'org_xyz';
      const matchedKeys = ['rc:user1:org_xyz', 'rc:user2:org_xyz:brand1'];

      async function* fakeIterator() {
        for (const key of matchedKeys) {
          yield key;
        }
      }
      mockScanIterator.mockReturnValue(fakeIterator());
      mockUnlink.mockResolvedValue(2);

      await service.invalidateForOrganization(orgId);

      expect(mockScanIterator).toHaveBeenCalledWith({
        COUNT: 100,
        MATCH: `rc:*:${orgId}*`,
      });
      expect(mockUnlink).toHaveBeenCalledWith(matchedKeys);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should skip unlink when no matching keys are found', async () => {
      const orgId = 'org_empty';

      async function* emptyIterator() {
        // yields nothing
      }
      mockScanIterator.mockReturnValue(emptyIterator());

      await service.invalidateForOrganization(orgId);

      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('0'),
        expect.any(Object),
      );
    });

    it('should log an error when scanIterator throws', async () => {
      const orgId = 'org_error';
      const error = new Error('SCAN failed');

      // Simulate an async iterable that throws on iteration
      const errorIterable = {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return Promise.reject(error);
            },
          };
        },
      };
      mockScanIterator.mockReturnValue(errorIterable);

      await service.invalidateForOrganization(orgId);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(orgId),
        error,
        expect.any(Object),
      );
    });
  });
});
