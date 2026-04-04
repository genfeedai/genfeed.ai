import { ClearCacheInterceptor } from '@api/cache/basic/cache.interceptor';
import { CacheService } from '@api/services/cache/services/cache.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

describe('ClearCacheInterceptor', () => {
  let interceptor: ClearCacheInterceptor;
  let cacheService: vi.Mocked<CacheService>;

  const mockExecutionContext = {} as ExecutionContext;

  const mockCallHandler: CallHandler = {
    handle: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClearCacheInterceptor,
        {
          provide: CacheService,
          useValue: {
            flush: vi.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<ClearCacheInterceptor>(ClearCacheInterceptor);
    cacheService = module.get(CacheService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should clear cache after successful request', async () => {
      const responseData = { data: 'test', success: true };

      (mockCallHandler.handle as vi.Mock).mockReturnValue(of(responseData));
      cacheService.flush.mockResolvedValue(true);

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Collect the observable result
      const result = await new Promise((resolve) => {
        result$.subscribe((data: unknown) => resolve(data));
      });

      expect(result).toEqual(responseData);
      expect(mockCallHandler.handle).toHaveBeenCalled();

      // Wait for async flush to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(cacheService.flush).toHaveBeenCalled();
    });

    it('should handle cache flush errors gracefully', async () => {
      const responseData = { success: true };
      const flushError = new Error('Cache flush failed');

      (mockCallHandler.handle as vi.Mock).mockReturnValue(of(responseData));
      cacheService.flush.mockRejectedValue(flushError);

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const result = await new Promise((resolve) => {
        result$.subscribe((data: unknown) => resolve(data));
      });

      expect(result).toEqual(responseData);

      // Wait for async flush to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(cacheService.flush).toHaveBeenCalled();
      // Cache flush error should not break the request
    });

    it('should not interfere with request errors', async () => {
      const requestError = new Error('Request failed');

      (mockCallHandler.handle as vi.Mock).mockReturnValue(
        throwError(() => requestError),
      );

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await expect(
        new Promise((resolve, reject) => {
          result$.subscribe({
            error: reject,
            next: resolve,
          });
        }),
      ).rejects.toThrow('Request failed');

      expect(mockCallHandler.handle).toHaveBeenCalled();
      // Cache should not be cleared on error
      expect(cacheService.flush).not.toHaveBeenCalled();
    });

    it('should work with multiple sequential requests', async () => {
      const responseData1 = { id: 1 };
      const responseData2 = { id: 2 };

      cacheService.flush.mockResolvedValue(true);

      // First request
      (mockCallHandler.handle as vi.Mock).mockReturnValue(of(responseData1));
      const result1$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      await new Promise((resolve) => {
        result1$.subscribe((data: unknown) => resolve(data));
      });

      // Second request
      (mockCallHandler.handle as vi.Mock).mockReturnValue(of(responseData2));
      const result2$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      await new Promise((resolve) => {
        result2$.subscribe((data: unknown) => resolve(data));
      });

      // Wait for async flushes
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(cacheService.flush).toHaveBeenCalledTimes(2);
    });

    it('should pass through response data unchanged', async () => {
      const complexData = {
        data: {
          page: 1,
          total: 2,
          users: [{ id: 1 }, { id: 2 }],
        },
        metadata: {
          timestamp: new Date(),
          version: '1.0',
        },
        success: true,
      };

      (mockCallHandler.handle as vi.Mock).mockReturnValue(of(complexData));
      cacheService.flush.mockResolvedValue(true);

      const result$ = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const result = await new Promise((resolve) => {
        result$.subscribe((data: unknown) => resolve(data));
      });

      expect(result).toEqual(complexData);
    });
  });
});
