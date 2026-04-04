import {
  CacheInvalidationService,
  RedisCacheInterceptor,
} from '@api/cache/redis/redis-cache.interceptor';
import { CacheService } from '@api/services/cache/services/cache.service';
import type { CacheOptions } from '@api/shared/interfaces/cache/cache.interfaces';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('redis', () => {
  const createMultiMock = () => ({
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockReturnThis(),
    setEx: vi.fn().mockReturnThis(),
  });

  const clientMock = {
    connect: vi.fn().mockResolvedValue(undefined),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    incrBy: vi.fn(),
    mGet: vi.fn(),
    multi: vi.fn(createMultiMock),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    sAdd: vi.fn(),
    set: vi.fn(),
    setEx: vi.fn(),
    sMembers: vi.fn(),
  };

  return {
    __esModule: true,
    createClient: vi.fn(() => clientMock),
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
            set: vi.fn(),
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

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cacheService.set).toHaveBeenCalledWith(
            expect.any(String),
            handlerResult,
            { tags: ['test'], ttl: 300 },
          );
          resolve();
        }, 0);
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

      await new Promise<void>((resolve) => {
        result$.subscribe(() => {
          setTimeout(() => {
            expect(cacheService.set).not.toHaveBeenCalled();
            resolve();
          }, 0);
        });
      });
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

      await new Promise<void>((resolve) => {
        result$.subscribe(() => {
          setTimeout(() => {
            expect(cacheService.set).toHaveBeenCalledWith(
              expect.any(String),
              null,
              expect.any(Object),
            );
            resolve();
          }, 0);
        });
      });
    });

    it('should respect custom condition function', async () => {
      const cacheOptions: CacheOptions = {
        condition: (result: { shouldCache?: boolean }) =>
          result.shouldCache === true,
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

      await new Promise<void>((resolve) => {
        result$.subscribe(() => {
          setTimeout(() => {
            expect(cacheService.set).toHaveBeenCalled();
            resolve();
          }, 0);
        });
      });
    });

    it('should not cache when condition returns false', async () => {
      const cacheOptions: CacheOptions = {
        condition: (result: { shouldCache?: boolean }) =>
          result.shouldCache === true,
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

      await new Promise<void>((resolve) => {
        result$.subscribe(() => {
          setTimeout(() => {
            expect(cacheService.set).not.toHaveBeenCalled();
            resolve();
          }, 0);
        });
      });
    });
  });

  describe('error handling', () => {
    it('should handle handler errors without caching', async () => {
      const cacheOptions: CacheOptions = { ttl: 300 };
      reflector.get.mockReturnValue(cacheOptions);
      cacheService.get.mockResolvedValue(null);

      const error = new Error('Handler error');
      mockCallHandler.handle = vi.fn().mockReturnValue(throwError(() => error));

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      result$.subscribe({
        error: (err) => {
          expect(err).toBe(error);
          expect(cacheService.set).not.toHaveBeenCalled();
        },
        next: () => undefined,
      });
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

describe('CacheInvalidationService', () => {
  let service: CacheInvalidationService;
  let cacheService: vi.Mocked<CacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheInvalidationService,
        {
          provide: CacheService,
          useValue: {
            del: vi.fn(),
            invalidateByTags: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CacheInvalidationService>(CacheInvalidationService);
    cacheService = module.get(CacheService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('invalidateByTags', () => {
    it('should invalidate cache entries by tags', async () => {
      const tags = ['user', 'profile'];
      cacheService.invalidateByTags.mockResolvedValue(5);

      await service.invalidateByTags(tags);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(tags);
    });

    it('should handle errors during tag invalidation', async () => {
      const tags = ['user'];
      cacheService.invalidateByTags.mockRejectedValue(
        new Error('Invalidation error'),
      );

      await service.invalidateByTags(tags);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(tags);
    });
  });

  describe('invalidateByPattern', () => {
    it('should delete exact cache keys', async () => {
      const pattern = 'exact:key:123';
      cacheService.del.mockResolvedValue(true);

      await service.invalidateByPattern(pattern);

      expect(cacheService.del).toHaveBeenCalledWith(pattern);
    });

    it('should warn about wildcard patterns', async () => {
      const pattern = 'user:*';
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await service.invalidateByPattern(pattern);

      expect(cacheService.del).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should handle errors during pattern invalidation', async () => {
      const pattern = 'key:123';
      cacheService.del.mockRejectedValue(new Error('Delete error'));

      await service.invalidateByPattern(pattern);

      expect(cacheService.del).toHaveBeenCalledWith(pattern);
    });
  });

  describe('invalidateForUser', () => {
    it('should invalidate all cache for a user', async () => {
      const userId = 'user-123';
      cacheService.invalidateByTags.mockResolvedValue(3);

      await service.invalidateForUser(userId);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        `user:${userId}`,
      ]);
    });
  });

  describe('invalidateForController', () => {
    it('should invalidate all cache for a controller', async () => {
      const controllerName = 'UserController';
      cacheService.invalidateByTags.mockResolvedValue(10);

      await service.invalidateForController(controllerName);

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith([
        'usercontroller',
      ]);
    });
  });
});
