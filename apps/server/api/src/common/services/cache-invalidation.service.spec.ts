import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { CacheClientService } from '@api/services/cache/services/cache-client.service';
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
});
