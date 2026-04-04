import { CacheService } from '@api/services/cache/services/cache.service';
import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { CacheKeyService } from '@api/services/cache/services/cache-key.service';
import { CacheTagsService } from '@api/services/cache/services/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisClientType } from 'redis';

describe('CacheService', () => {
  let service: CacheService;
  let loggerService: LoggerService;
  let cacheTagsService: CacheTagsService;
  let mockRedisClient: vi.Mocked<RedisClientType>;

  beforeEach(async () => {
    const mockLogger: LoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    mockRedisClient = {
      del: vi.fn(),
      exists: vi.fn(),
      expire: vi.fn(),
      flushDb: vi.fn(),
      get: vi.fn(),
      incrBy: vi.fn(),
      mGet: vi.fn(),
      multi: vi.fn(() => ({
        del: vi.fn(),
        exec: vi.fn(),
        set: vi.fn(),
        setEx: vi.fn(),
      })),
      setEx: vi.fn(),
    } as unknown as vi.Mocked<RedisClientType>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        CacheKeyService,
        {
          provide: CacheClientService,
          useValue: {
            instance: mockRedisClient,
          },
        },
        {
          provide: CacheTagsService,
          useValue: {
            invalidateByTags: vi.fn(),
            setTags: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get(CacheService);
    loggerService = module.get(LoggerService);
    cacheTagsService = module.get(CacheTagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('returns parsed value', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));
      await expect(service.get('test:key')).resolves.toEqual({ foo: 'bar' });
    });

    it('handles client errors', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('boom'));
      await expect(service.get('test:key')).resolves.toBeNull();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('writes value with default TTL', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      const result = await service.set('key', { foo: 'bar' });
      expect(result).toBe(true);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'key',
        300,
        JSON.stringify({ foo: 'bar' }),
      );
    });

    it('writes cache tags when provided', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      await service.set('key', {}, { tags: ['tag'] });
      expect(cacheTagsService.setTags).toHaveBeenCalledWith('key', ['tag']);
    });

    it('gracefully handles errors', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('oops'));
      const result = await service.set('key', {});
      expect(result).toBe(false);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('invalidateByTags', () => {
    it('delegates to cache tag service', async () => {
      (cacheTagsService.invalidateByTags as vi.Mock).mockResolvedValue(2);
      await expect(service.invalidateByTags(['tag'])).resolves.toBe(2);
    });
  });

  describe('mget', () => {
    it('returns parsed values in order', async () => {
      mockRedisClient.mGet.mockResolvedValue([JSON.stringify({ id: 1 }), null]);
      await expect(service.mget(['a', 'b'])).resolves.toEqual([
        { id: 1 },
        null,
      ]);
    });
  });

  describe('flush', () => {
    it('flushes redis DB', async () => {
      mockRedisClient.flushDb.mockResolvedValue('OK' as unknown as string);
      await expect(service.flush()).resolves.toBe(true);
    });
  });
});
