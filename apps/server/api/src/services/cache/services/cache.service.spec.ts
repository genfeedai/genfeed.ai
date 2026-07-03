import { CacheService } from '@api/services/cache/services/cache.service';
import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { CacheTagsService } from '@api/services/cache/services/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

describe('CacheService', () => {
  let service: CacheService;
  let loggerService: LoggerService;
  let cacheTagsService: CacheTagsService;
  let mockRedisClient: vi.Mocked<Redis>;

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
      flushdb: vi.fn(),
      get: vi.fn(),
      incrby: vi.fn(),
      mget: vi.fn(),
      multi: vi.fn(() => ({
        del: vi.fn(),
        exec: vi.fn(),
        set: vi.fn(),
        setex: vi.fn(),
      })),
      set: vi.fn(),
      setex: vi.fn(),
    } as unknown as vi.Mocked<Redis>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
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
      mockRedisClient.setex.mockResolvedValue('OK');
      const result = await service.set('key', { foo: 'bar' });
      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'key',
        300,
        JSON.stringify({ foo: 'bar' }),
      );
    });

    it('writes cache tags when provided', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');
      await service.set('key', {}, { tags: ['tag'] });
      expect(cacheTagsService.setTags).toHaveBeenCalledWith('key', ['tag']);
    });

    it('gracefully handles errors', async () => {
      const error = new Error('oops');
      mockRedisClient.setex.mockRejectedValue(error);
      const result = await service.set('key', {});
      expect(result).toBe(false);
      expect(loggerService.error).toHaveBeenCalledWith(
        'CacheService set error',
        { error, key: 'key' },
      );
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
      mockRedisClient.mget.mockResolvedValue([JSON.stringify({ id: 1 }), null]);
      await expect(service.mget(['a', 'b'])).resolves.toEqual([
        { id: 1 },
        null,
      ]);
    });
  });

  describe('flush', () => {
    it('flushes redis DB', async () => {
      mockRedisClient.flushdb.mockResolvedValue('OK' as unknown as 'OK');
      await expect(service.flush()).resolves.toBe(true);
    });

    it('logs flush errors with the existing payload shape', async () => {
      const error = new Error('flush failed');
      mockRedisClient.flushdb.mockRejectedValue(error);
      await expect(service.flush()).resolves.toBe(false);
      expect(loggerService.error).toHaveBeenCalledWith(
        'CacheService flush error',
        error,
      );
    });
  });

  describe('acquireLock', () => {
    it('acquires the lock using SET NX EX with positional args', async () => {
      (mockRedisClient.set as vi.Mock).mockResolvedValue('OK');
      const result = await service.acquireLock('resource', 60);
      expect(result).toBe(true);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'lock:resource',
        expect.any(String),
        'EX',
        60,
        'NX',
      );
    });

    it('returns false when the lock is already held', async () => {
      (mockRedisClient.set as vi.Mock).mockResolvedValue(null);
      await expect(service.acquireLock('resource', 60)).resolves.toBe(false);
    });
  });

  describe('generateKey', () => {
    it('joins namespace and parts with colons', () => {
      expect(service.generateKey('brands', 'org-1', 42)).toBe(
        'brands:org-1:42',
      );
    });

    it('returns namespace with trailing colon boundary when no parts given', () => {
      expect(service.generateKey('brands')).toBe('brands:');
    });
  });
});
