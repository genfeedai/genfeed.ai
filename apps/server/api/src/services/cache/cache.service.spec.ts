import { CacheService } from '@api/services/cache/cache.service';
import { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type Redis from 'ioredis';

describe('CacheService', () => {
  let service: CacheService;
  let loggerService: LoggerService;
  let cacheTagsService: CacheTagsService;
  let mockRedisClient: vi.Mocked<Redis>;
  /** Flipped per test to exercise the client-unavailable gate. */
  let isClientReady: boolean;

  beforeEach(async () => {
    isClientReady = true;

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
            get isReady(): boolean {
              return isClientReady;
            },
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

  describe('del', () => {
    it('gracefully handles client errors', async () => {
      const error = new Error('oops');
      mockRedisClient.del.mockRejectedValue(error);

      await expect(service.del('key')).resolves.toBe(false);
      expect(loggerService.error).toHaveBeenCalledWith(
        'CacheService del error',
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

  describe('claimOnce', () => {
    it('reports a first claim', async () => {
      (mockRedisClient.set as vi.Mock).mockResolvedValue('OK');

      await expect(
        service.claimOnce('delivery:1', 3600, ['webhook:replicate']),
      ).resolves.toBe('claimed');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'delivery:1',
        '1',
        'EX',
        3600,
        'NX',
      );
      expect(cacheTagsService.setTags).toHaveBeenCalledWith('delivery:1', [
        'webhook:replicate',
      ]);
    });

    it('reports a repeat claim as a duplicate', async () => {
      (mockRedisClient.set as vi.Mock).mockResolvedValue(null);

      await expect(service.claimOnce('delivery:1', 3600)).resolves.toBe(
        'duplicate',
      );
      expect(cacheTagsService.setTags).not.toHaveBeenCalled();
    });

    it('distinguishes a failed command from a duplicate', async () => {
      (mockRedisClient.set as vi.Mock).mockRejectedValue(new Error('boom'));

      await expect(service.claimOnce('delivery:1', 3600)).resolves.toBe(
        'unavailable',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('when the cache client is not ready', () => {
    // A command issued while ioredis is disconnected sits in its offline queue
    // and never settles, so these must short-circuit rather than reach the
    // client: a `try/catch` cannot degrade a call that never returns.
    beforeEach(() => {
      isClientReady = false;
    });

    it('reports a cache miss without issuing a read', async () => {
      await expect(service.get('key')).resolves.toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('reports a failed write without issuing one', async () => {
      await expect(service.set('key', { foo: 'bar' })).resolves.toBe(false);
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
      expect(cacheTagsService.setTags).not.toHaveBeenCalled();
    });

    it('returns a null per key from mget without issuing a read', async () => {
      await expect(service.mget(['a', 'b'])).resolves.toEqual([null, null]);
      expect(mockRedisClient.mget).not.toHaveBeenCalled();
    });

    it('skips tag invalidation', async () => {
      await expect(service.invalidateByTags(['tag'])).resolves.toBe(0);
      expect(cacheTagsService.invalidateByTags).not.toHaveBeenCalled();
    });

    it('refuses to acquire a lock it cannot hold', async () => {
      await expect(service.acquireLock('resource', 60)).resolves.toBe(false);
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('reports a claim as unavailable rather than duplicate', async () => {
      // Idempotency callers fail open on `unavailable`; reporting `duplicate`
      // here would drop every inbound event for the length of the outage.
      await expect(service.claimOnce('delivery:1', 3600)).resolves.toBe(
        'unavailable',
      );
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('still falls back to the factory in getOrSet', async () => {
      const factory = vi.fn().mockResolvedValue({ fresh: true });
      await expect(service.getOrSet('key', factory)).resolves.toEqual({
        fresh: true,
      });
      expect(factory).toHaveBeenCalledTimes(1);
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
