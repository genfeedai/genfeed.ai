import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { CacheService } from '@api/services/cache/cache.service';
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { defer, firstValueFrom, of, throwError } from 'rxjs';

const drainPromises = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

vi.mock('ioredis', () => {
  const createMultiMock = () => ({
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockReturnThis(),
    setex: vi.fn().mockReturnThis(),
  });

  const clientMock = {
    connect: vi.fn().mockResolvedValue(undefined),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    incrby: vi.fn(),
    mget: vi.fn(),
    multi: vi.fn(createMultiMock),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    sadd: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    smembers: vi.fn(),
  };

  return {
    default: vi.fn(() => clientMock),
  };
});

describe('RedisCacheInterceptor', () => {
  let interceptor: RedisCacheInterceptor;
  let cacheService: vi.Mocked<CacheService>;
  let reflector: vi.Mocked<Reflector>;
  let mockExecutionContext: ExecutionContext;
  let mockRequest: Record<string, unknown>;
  let mockCallHandler: CallHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheInterceptor,
        {
          provide: CacheService,
          useValue: {
            del: vi.fn(),
            get: vi.fn(),
            invalidateByTags: vi.fn(),
            readTagEpochs: vi.fn(async (tags: string[]) =>
              tags.length ? tags.map(() => '0') : null,
            ),
            set: vi.fn(),
            setUnlessTagsInvalidated: vi.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<RedisCacheInterceptor>(RedisCacheInterceptor);
    cacheService = module.get(CacheService);
    reflector = module.get(Reflector);

    mockRequest = {
      method: 'GET',
      query: { limit: 10 },
      route: { path: '/api/test' },
      url: '/api/test?limit=10',
      user: { id: 'user-123' },
    };

    mockExecutionContext = {
      getArgByIndex: vi.fn(),
      getArgs: vi.fn().mockReturnValue([]),
      getClass: vi.fn().mockReturnValue({ name: 'TestController' }),
      getHandler: vi.fn().mockReturnValue({ name: 'testMethod' }),
      getType: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest),
      }),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    } as ExecutionContext;

    mockCallHandler = {
      handle: vi.fn().mockReturnValue(of({ data: 'test' })),
    } as CallHandler;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('when no cache options are configured', () => {
    it('should proceed without caching', async () => {
      reflector.get.mockReturnValue(undefined);

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      result$.subscribe((value) => {
        expect(value).toEqual({ data: 'test' });
      });

      expect(reflector.get).toHaveBeenCalledWith('cache', expect.anything());
      expect(cacheService.get).not.toHaveBeenCalled();
      expect(mockCallHandler.handle).toHaveBeenCalled();
    });
  });

  describe('when cache options are configured', () => {
    const cacheOptions: CacheOptions = {
      tags: ['test'],
      ttl: 300,
    };

    beforeEach(() => {
      reflector.get.mockReturnValue(cacheOptions);
    });

    it('should return cached result on cache hit', async () => {
      const cachedData = { cached: true, data: 'cached-test' };
      cacheService.get.mockResolvedValue(cachedData);

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      result$.subscribe((value) => {
        expect(value).toEqual(cachedData);
      });

      expect(cacheService.get).toHaveBeenCalledWith(
        'TestController:testMethod:/api/test:user:user-123:query:{"limit":10}',
      );
      expect(mockCallHandler.handle).not.toHaveBeenCalled();
    });

    it('should execute handler and cache result on cache miss', async () => {
      cacheService.get.mockResolvedValue(null);
      const handlerResult = { data: 'fresh-test', fresh: true };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(handlerResult));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      result$.subscribe((value) => {
        expect(value).toEqual(handlerResult);
      });

      expect(cacheService.get).toHaveBeenCalled();
      expect(mockCallHandler.handle).toHaveBeenCalled();

      await vi.waitFor(() => {
        expect(cacheService.setUnlessTagsInvalidated).toHaveBeenCalledWith(
          expect.any(String),
          handlerResult,
          { tags: ['test'], ttl: 300 },
          ['0'],
        );
      });
    });

    it('should handle cache service errors gracefully', async () => {
      cacheService.get.mockRejectedValue(new Error('Cache error'));
      const handlerResult = { data: 'fallback' };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(handlerResult));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      result$.subscribe((value) => {
        expect(value).toEqual(handlerResult);
      });

      expect(mockCallHandler.handle).toHaveBeenCalled();
    });
  });

  describe('key generation', () => {
    it('should use custom key generator when provided', async () => {
      const customKey = 'custom:key:123';
      const cacheOptions: CacheOptions = {
        keyGenerator: vi.fn().mockReturnValue(customKey),
        ttl: 300,
      };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(null);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(cacheOptions.keyGenerator).toHaveBeenCalledWith(mockRequest);
      expect(cacheService.get).toHaveBeenCalledWith(customKey);
    });

    it('should skip caching when the key generator returns an empty key', async () => {
      const cacheOptions: CacheOptions = {
        keyGenerator: vi.fn().mockReturnValue(''),
        ttl: 300,
      };
      reflector.get.mockReturnValue(cacheOptions);

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      result$.subscribe((value) => {
        expect(value).toEqual({ data: 'test' });
      });

      expect(cacheOptions.keyGenerator).toHaveBeenCalledWith(mockRequest);
      expect(cacheService.get).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should generate default key for anonymous users', async () => {
      const cacheOptions: CacheOptions = { ttl: 300 };
      reflector.get.mockReturnValue(cacheOptions);

      mockExecutionContext.switchToHttp = vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          method: 'GET',
          query: {},
          route: { path: '/api/test' },
          url: '/api/test',
        }),
      });

      cacheService.get.mockResolvedValue(null);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(cacheService.get).toHaveBeenCalledWith(
        'TestController:testMethod:/api/test:user:anonymous',
      );
    });

    it('should include sorted query parameters in key', async () => {
      const cacheOptions: CacheOptions = { ttl: 300 };
      reflector.get.mockReturnValue(cacheOptions);

      mockExecutionContext.switchToHttp = vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          method: 'GET',
          query: { a: 'first', m: 'middle', z: 'last' },
          route: { path: '/api/test' },
          user: { id: 'user-123' },
        }),
      });

      cacheService.get.mockResolvedValue(null);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(cacheService.get).toHaveBeenCalledWith(
        'TestController:testMethod:/api/test:user:user-123:query:{"a":"first","m":"middle","z":"last"}',
      );
    });

    it('should include normalized body for non-GET requests', async () => {
      const cacheOptions: CacheOptions = { ttl: 300 };
      reflector.get.mockReturnValue(cacheOptions);

      mockExecutionContext.switchToHttp = vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({
          body: { a: 'one', b: 'two' },
          method: 'POST',
          query: {},
          route: { path: '/api/test' },
          user: { id: 'user-123' },
        }),
      });

      cacheService.get.mockResolvedValue(null);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(cacheService.get).toHaveBeenCalledWith(
        'TestController:testMethod:/api/test:user:user-123:body:{"a":"one","b":"two"}',
      );
    });
  });

  describe('conditional caching', () => {
    it('should not cache null values when cacheNullValues is false', async () => {
      const cacheOptions: CacheOptions = {
        cacheNullValues: false,
        ttl: 300,
      };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(undefined);
      mockCallHandler.handle = vi.fn().mockReturnValue(of(null));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const value = await firstValueFrom(result$);
      await drainPromises();

      expect(value).toBeNull();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should cache null values when cacheNullValues is true', async () => {
      const cacheOptions: CacheOptions = {
        cacheNullValues: true,
        ttl: 300,
      };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(undefined);
      mockCallHandler.handle = vi.fn().mockReturnValue(of(null));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await firstValueFrom(result$);

      await vi.waitFor(() => {
        expect(cacheService.set).toHaveBeenCalledWith(
          expect.any(String),
          null,
          expect.any(Object),
        );
      });
    });

    it('should respect custom condition function', async () => {
      const cacheOptions: CacheOptions = {
        condition: (result) =>
          (result as { shouldCache?: boolean }).shouldCache === true,
        ttl: 300,
      };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(null);

      const resultWithCache = { data: 'test', shouldCache: true };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(resultWithCache));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await firstValueFrom(result$);

      await vi.waitFor(() => {
        expect(cacheService.set).toHaveBeenCalled();
      });
    });

    it('should not cache when condition returns false', async () => {
      const cacheOptions: CacheOptions = {
        condition: (result) =>
          (result as { shouldCache?: boolean }).shouldCache === true,
        ttl: 300,
      };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(null);

      const resultWithoutCache = { data: 'test', shouldCache: false };
      mockCallHandler.handle = vi.fn().mockReturnValue(of(resultWithoutCache));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const value = await firstValueFrom(result$);
      await drainPromises();

      expect(value).toEqual(resultWithoutCache);
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('concurrent misses for one key', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, reject, resolve };
    }

    beforeEach(() => {
      reflector.get.mockReturnValue({ ttl: 300 } satisfies CacheOptions);
      cacheService.get.mockResolvedValue(null);
    });

    it('runs the handler once for 20 concurrent requests and gives each the same body', async () => {
      const load = deferred<{ brand: string }>();
      let calls = 0;
      mockCallHandler.handle = () =>
        defer(() => {
          calls += 1;
          return load.promise;
        });

      const responses = Array.from({ length: 20 }, () =>
        interceptor
          .intercept(mockExecutionContext, mockCallHandler)
          .then((result$) => firstValueFrom(result$)),
      );
      await drainPromises();
      load.resolve({ brand: 'acme' });

      const bodies = await Promise.all(responses);
      expect(calls).toBe(1);
      expect(bodies).toHaveLength(20);
      for (const body of bodies) expect(body).toEqual({ brand: 'acme' });
    });

    it('lets each key load on its own', async () => {
      let calls = 0;
      mockCallHandler.handle = () => {
        calls += 1;
        return of({ run: calls });
      };
      const otherRequest = { ...mockRequest, query: { limit: 20 } };
      const otherContext = {
        ...mockExecutionContext,
        switchToHttp: vi.fn().mockReturnValue({
          getRequest: vi.fn().mockReturnValue(otherRequest),
        }),
      } as ExecutionContext;

      await Promise.all([
        interceptor.intercept(mockExecutionContext, mockCallHandler),
        interceptor.intercept(otherContext, mockCallHandler),
      ]);

      expect(calls).toBe(2);
    });

    it('does not cache a rejected load and runs the handler again on the next request', async () => {
      const load = deferred<{ run: number }>();
      let calls = 0;
      mockCallHandler.handle = () =>
        defer(() => {
          calls += 1;
          return calls === 1 ? load.promise : of({ run: calls });
        });

      const waiting = Array.from({ length: 3 }, () =>
        interceptor
          .intercept(mockExecutionContext, mockCallHandler)
          .then((result$) => firstValueFrom(result$))
          .then(
            () => null,
            (thrown: unknown) => thrown,
          ),
      );
      await drainPromises();
      const failure = new Error('database down');
      load.reject(failure);

      expect(await Promise.all(waiting)).toEqual([failure, failure, failure]);
      expect(calls).toBe(1);
      expect(cacheService.set).not.toHaveBeenCalled();

      const next$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      expect(await firstValueFrom(next$)).toEqual({ run: 2 });
      expect(calls).toBe(2);
    });

    it('runs the handler again once the previous load has settled', async () => {
      let calls = 0;
      mockCallHandler.handle = () => {
        calls += 1;
        return of({ run: calls });
      };

      const first$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      const second$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(await firstValueFrom(first$)).toEqual({ run: 1 });
      expect(await firstValueFrom(second$)).toEqual({ run: 2 });
    });
  });

  describe('error handling', () => {
    it('should handle handler errors without caching', async () => {
      const cacheOptions: CacheOptions = { ttl: 300 };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(null);

      const error = new Error('Handler error');
      mockCallHandler.handle = vi.fn().mockReturnValue(throwError(() => error));

      await expect(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      ).rejects.toBe(error);
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('runs a throwing handler once and surfaces its exact error', async () => {
      reflector.get.mockReturnValue({ ttl: 300 } satisfies CacheOptions);
      cacheService.get.mockResolvedValue(null);

      let calls = 0;
      mockCallHandler.handle = () => {
        calls += 1;
        return throwError(() => new Error(`Handler error run ${calls}`));
      };

      const failure = await interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .then((result$) => firstValueFrom(result$))
        .then(
          () => null,
          (thrown: unknown) => thrown,
        );

      expect(calls).toBe(1);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe('Handler error run 1');
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('runs the handler once and returns its result when the cache read throws', async () => {
      reflector.get.mockReturnValue({ ttl: 300 } satisfies CacheOptions);
      cacheService.get.mockRejectedValue(new Error('Cache read error'));

      let calls = 0;
      mockCallHandler.handle = () => {
        calls += 1;
        return of({ run: calls });
      };

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(await firstValueFrom(result$)).toEqual({ run: 1 });
      expect(calls).toBe(1);
    });

    it('returns the handler result when the cache write throws', async () => {
      reflector.get.mockReturnValue({ ttl: 300 } satisfies CacheOptions);
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockRejectedValue(new Error('Cache write error'));

      let calls = 0;
      mockCallHandler.handle = () => {
        calls += 1;
        return of({ run: calls });
      };

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(await firstValueFrom(result$)).toEqual({ run: 1 });
      await drainPromises();
      expect(calls).toBe(1);
    });

    it('does not call the handler on a cache hit', async () => {
      reflector.get.mockReturnValue({ ttl: 300 } satisfies CacheOptions);
      cacheService.get.mockResolvedValue({ cached: true });

      let calls = 0;
      mockCallHandler.handle = () => {
        calls += 1;
        return of({ run: calls });
      };

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(await firstValueFrom(result$)).toEqual({ cached: true });
      expect(calls).toBe(0);
    });

    it('should return a missed result without waiting for the cache write', async () => {
      const cacheOptions: CacheOptions = { ttl: 300 };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockReturnValue(new Promise<boolean>(() => undefined));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      const value = await new Promise((resolve) => result$.subscribe(resolve));

      expect(value).toEqual({ data: 'test' });
    });

    it('should handle cache set errors gracefully', async () => {
      const cacheOptions: CacheOptions = { ttl: 300 };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockRejectedValue(new Error('Cache set error'));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      result$.subscribe((value) => {
        expect(value).toEqual({ data: 'test' });
      });
    });
  });
});
