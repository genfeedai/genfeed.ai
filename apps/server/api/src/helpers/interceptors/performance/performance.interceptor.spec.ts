import {
  APIMetricsInterceptor,
  PerformanceInterceptor,
} from '@api/helpers/interceptors/performance/performance.interceptor';
import { LoggerService } from '@libs/logger/logger.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, of, throwError } from 'rxjs';

describe('PerformanceInterceptor', () => {
  let interceptor: PerformanceInterceptor;
  let loggerService: vi.Mocked<LoggerService>;

  const mockExecutionContext = {
    getRequest: vi.fn(),
    getResponse: vi.fn(),
    switchToHttp: vi.fn().mockReturnThis(),
  } as unknown as ExecutionContext;

  const mockRequest = {
    headers: { 'user-agent': 'test-agent' },
    method: 'GET',
    url: '/api/test',
    user: { id: 'user123' },
  };

  const mockResponse = {
    statusCode: 200,
  };

  const mockCallHandler = {
    handle: vi.fn(),
  } as unknown as CallHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceInterceptor,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<PerformanceInterceptor>(PerformanceInterceptor);
    loggerService = module.get(LoggerService);

    (mockExecutionContext as any).getRequest.mockReturnValue(mockRequest);
    (mockExecutionContext as any).getResponse.mockReturnValue(mockResponse);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should log debug for fast requests', async () => {
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          duration: expect.any(Number),
          method: 'GET',
          severity: 'LOW',
          statusCode: 200,
          timestamp: expect.any(String),
          url: '/api/test',
          userAgent: 'test-agent',
          userId: 'user123',
        }),
      );
    });

    it('should log warn for slow requests', async () => {
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      const originalNow = Date.now;
      Date.now = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(2001);

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Slow request detected',
        expect.objectContaining({
          duration: 1001,
          method: 'GET',
          severity: 'MEDIUM',
          url: '/api/test',
        }),
      );
      Date.now = originalNow;
    });

    it('should log warn for very slow requests', async () => {
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      const originalNow = Date.now;
      Date.now = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(7000);

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        'Very slow request detected',
        expect.objectContaining({
          duration: 6000,
          method: 'GET',
          severity: 'HIGH',
          url: '/api/test',
        }),
      );
      Date.now = originalNow;
    });

    it('should log error for failed requests', async () => {
      const error = Object.assign(new Error('Test error'), { status: 400 });
      (mockCallHandler as any).handle.mockReturnValue(throwError(() => error));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      ).catch(() => {});

      expect(loggerService.error).toHaveBeenCalledWith(
        'Request failed',
        expect.objectContaining({
          duration: expect.any(Number),
          error: {
            message: 'Test error',
            name: 'Error',
            stack: expect.any(String),
          },
          method: 'GET',
          statusCode: 400,
          url: '/api/test',
        }),
      );
    });

    it('should handle requests without user', async () => {
      const requestWithoutUser = { ...mockRequest, user: undefined };
      (mockExecutionContext as any).getRequest.mockReturnValue(
        requestWithoutUser,
      );
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          userId: undefined,
        }),
      );
    });

    it('should handle requests without user-agent', async () => {
      const requestWithoutUserAgent = { ...mockRequest, headers: {} };
      (mockExecutionContext as any).getRequest.mockReturnValue(
        requestWithoutUserAgent,
      );
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          userAgent: undefined,
        }),
      );
    });
  });
});

describe('APIMetricsInterceptor', () => {
  let interceptor: APIMetricsInterceptor;
  let loggerService: vi.Mocked<LoggerService>;

  const mockExecutionContext = {
    getRequest: vi.fn(),
    switchToHttp: vi.fn().mockReturnThis(),
  } as unknown as ExecutionContext;

  const mockCallHandler = {
    handle: vi.fn(),
  } as unknown as CallHandler;

  beforeEach(() => {
    loggerService = {
      debug: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;
    interceptor = new APIMetricsInterceptor(loggerService, true);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should log API endpoint usage for v1 routes', async () => {
      const mockRequest = {
        method: 'GET',
        url: '/v1/videos/123',
      };
      (mockExecutionContext as any).getRequest.mockReturnValue(mockRequest);
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        'API endpoint accessed',
        expect.objectContaining({
          endpoint: '/v1/videos/*',
          method: 'GET',
          timestamp: expect.any(String),
          type: 'api_usage',
        }),
      );
    });

    it('should skip API endpoint usage logging when disabled', async () => {
      interceptor = new APIMetricsInterceptor(loggerService, false);

      const mockRequest = {
        method: 'GET',
        url: '/v1/videos/123',
      };
      (mockExecutionContext as any).getRequest.mockReturnValue(mockRequest);
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).not.toHaveBeenCalled();
    });

    it('should not log for non-v1 routes', async () => {
      const mockRequest = {
        method: 'GET',
        url: '/api/test',
      };
      (mockExecutionContext as any).getRequest.mockReturnValue(mockRequest);
      (mockCallHandler as any).handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).not.toHaveBeenCalled();
    });

    it('should extract endpoint patterns correctly', async () => {
      const testCases = [
        {
          expected: '/v1/videos/*',
          url: '/v1/videos/507f1f77bcf86cd799439011',
        },
        { expected: '/v1/users/*', url: '/v1/users/123' },
        { expected: '/v1/posts/*', url: '/v1/posts/my-post-slug' },
        {
          expected: '/v1/videos/*/comments/*',
          url: '/v1/videos/507f1f77bcf86cd799439011/comments/456',
        },
      ];

      for (const { url, expected } of testCases) {
        const mockRequest = { method: 'GET', url };
        (mockExecutionContext as any).getRequest.mockReturnValue(mockRequest);
        (mockCallHandler as any).handle.mockReturnValue(of('success'));

        await firstValueFrom(
          interceptor.intercept(mockExecutionContext, mockCallHandler),
        );

        expect(loggerService.debug).toHaveBeenCalledWith(
          'API endpoint accessed',
          expect.objectContaining({
            endpoint: expected,
          }),
        );
      }
    });
  });
});
