import {
  APIMetricsInterceptor,
  PerformanceInterceptor,
} from '@api/helpers/interceptors/performance/performance.interceptor';
import { recordPrismaQuery } from '@api/helpers/performance/request-performance.context';
import { normalizeApiRoute } from '@api/helpers/performance/sentry-performance-monitor';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';

vi.mock('@sentry/nestjs', () => ({
  getActiveSpan: vi.fn(),
  metrics: {
    count: vi.fn(),
    distribution: vi.fn(),
  },
  setContext: vi.fn(),
  setHttpStatus: vi.fn(),
  setMeasurement: vi.fn(),
  setTag: vi.fn(),
  updateSpanName: vi.fn(),
}));

describe('PerformanceInterceptor', () => {
  let interceptor: PerformanceInterceptor;
  let configService: Pick<ConfigService, 'get'>;
  let configValues: Record<string, string | undefined>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockExecutionContext = {
    getRequest: vi.fn(),
    getResponse: vi.fn(),
    switchToHttp: vi.fn().mockReturnThis(),
  } as unknown as ExecutionContext & {
    getRequest: ReturnType<typeof vi.fn>;
    getResponse: ReturnType<typeof vi.fn>;
  };

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
    handle: vi.fn<CallHandler['handle']>(),
  } satisfies CallHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(Sentry.getActiveSpan).mockReturnValue(undefined);
    vi.mocked(Sentry.setMeasurement).mockImplementation(() => undefined);
    configValues = {
      API_SLOW_QUERY_THRESHOLD_MS: '100',
    };

    configService = {
      get: vi.fn((key: string) => configValues[key]),
    } as unknown as Pick<ConfigService, 'get'>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceInterceptor,
        {
          provide: ConfigService,
          useValue: configService,
        },
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

    mockExecutionContext.getRequest.mockReturnValue(mockRequest);
    mockExecutionContext.getResponse.mockReturnValue(mockResponse);
    mockCallHandler.handle.mockReset();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should log debug for fast requests', async () => {
      mockCallHandler.handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          duration: expect.any(Number),
          method: 'GET',
          route: '/api/test',
          severity: 'LOW',
          statusCode: 200,
          timestamp: expect.any(String),
          url: '/api/test',
          userAgent: 'test-agent',
          userId: 'user123',
        }),
      );
      expect(Sentry.setTag).toHaveBeenCalledWith('api.route', '/api/test');
      expect(Sentry.setMeasurement).toHaveBeenCalledWith(
        'api.request.duration',
        expect.any(Number),
        'millisecond',
        undefined,
      );
      expect(Sentry.setContext).toHaveBeenCalledWith(
        'api.performance',
        expect.objectContaining({
          method: 'GET',
          route: '/api/test',
          severity: 'LOW',
          statusCode: 200,
        }),
      );
      expect(Sentry.metrics.distribution).not.toHaveBeenCalled();
    });

    it('should attach database metrics when Prisma query metrics are enabled', async () => {
      configValues.API_QUERY_METRICS = 'true';
      mockCallHandler.handle.mockReturnValue(
        new Observable((subscriber) => {
          recordPrismaQuery(
            {
              duration: 150,
              params: '[]',
              query: 'SELECT * FROM "Post" WHERE "id" = $1',
              target: 'prisma:query',
              timestamp: new Date('2026-01-01T00:00:00.000Z'),
            },
            configService,
          );
          subscriber.next('success');
          subscriber.complete();
        }),
      );

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          database: {
            queryCount: 1,
            queryDuration: 150,
            slowQueries: [
              expect.objectContaining({
                duration: 150,
                fingerprint: 'SELECT * FROM ? WHERE ? = ?',
                target: 'prisma:query',
              }),
            ],
          },
        }),
      );
      expect(Sentry.setMeasurement).toHaveBeenCalledWith(
        'api.db.query_duration',
        150,
        'millisecond',
        undefined,
      );
      expect(Sentry.setMeasurement).toHaveBeenCalledWith(
        'api.db.query_count',
        1,
        'none',
        undefined,
      );
      expect(Sentry.setContext).toHaveBeenCalledWith('api.database', {
        queryCount: 1,
        queryDuration: 150,
        slowQueries: [
          expect.objectContaining({
            duration: 150,
            fingerprint: 'SELECT * FROM ? WHERE ? = ?',
            target: 'prisma:query',
          }),
        ],
      });
    });

    it('should annotate the active Sentry span with normalized route metrics', async () => {
      const activeSpan = {
        setAttributes: vi.fn(),
      };
      vi.mocked(Sentry.getActiveSpan).mockReturnValue(activeSpan as never);
      mockExecutionContext.getRequest.mockReturnValue({
        ...mockRequest,
        url: '/v1/videos/507f1f77bcf86cd799439011?include=comments',
      });
      mockCallHandler.handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(activeSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          'genfeed.api.duration_ms': expect.any(Number),
          'genfeed.api.performance_severity': 'LOW',
          'genfeed.api.route': '/v1/videos/*',
          'http.request.method': 'GET',
          'http.response.status_code': 200,
        }),
      );
      expect(Sentry.updateSpanName).toHaveBeenCalledWith(
        activeSpan,
        'GET /v1/videos/*',
      );
      expect(Sentry.setHttpStatus).toHaveBeenCalledWith(activeSpan, 200);
    });

    it('should emit Sentry distribution metrics when enabled', async () => {
      configValues.API_SENTRY_PERFORMANCE_METRICS = 'true';
      mockExecutionContext.getRequest.mockReturnValue({
        ...mockRequest,
        url: '/v1/posts/my-post-slug',
      });
      mockCallHandler.handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(Sentry.metrics.count).toHaveBeenCalledWith(
        'api.request.count',
        1,
        {
          attributes: {
            method: 'GET',
            route: '/v1/posts/*',
            severity: 'LOW',
            status_code: '200',
          },
        },
      );
      expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
        'api.request.duration',
        expect.any(Number),
        {
          attributes: {
            method: 'GET',
            route: '/v1/posts/*',
            severity: 'LOW',
            status_code: '200',
          },
          unit: 'millisecond',
        },
      );
    });

    it('should continue the request when Sentry telemetry fails', async () => {
      vi.mocked(Sentry.setMeasurement).mockImplementationOnce(() => {
        throw new Error('Sentry unavailable');
      });
      mockCallHandler.handle.mockReturnValue(of('success'));

      await firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      );

      expect(loggerService.debug).toHaveBeenCalledWith(
        'Request completed',
        expect.objectContaining({
          route: '/api/test',
          severity: 'LOW',
        }),
      );
    });

    it('should log warn for slow requests', async () => {
      mockCallHandler.handle.mockReturnValue(of('success'));

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
      mockCallHandler.handle.mockReturnValue(of('success'));

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
      mockCallHandler.handle.mockReturnValue(throwError(() => error));

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
      mockExecutionContext.getRequest.mockReturnValue(requestWithoutUser);
      mockCallHandler.handle.mockReturnValue(of('success'));

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
      mockExecutionContext.getRequest.mockReturnValue(requestWithoutUserAgent);
      mockCallHandler.handle.mockReturnValue(of('success'));

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

describe('normalizeApiRoute', () => {
  it('should keep static collection routes intact', () => {
    expect(normalizeApiRoute('/v1/videos')).toBe('/v1/videos');
    expect(normalizeApiRoute('/v1/content-orchestration')).toBe(
      '/v1/content-orchestration',
    );
  });

  it('should replace high-cardinality path segments', () => {
    expect(normalizeApiRoute('/v1/videos/507f1f77bcf86cd799439011')).toBe(
      '/v1/videos/*',
    );
    expect(normalizeApiRoute('/v1/users/123')).toBe('/v1/users/*');
    expect(normalizeApiRoute('/v1/posts/my-post-slug')).toBe('/v1/posts/*');
    expect(
      normalizeApiRoute(
        '/v1/videos/507f1f77bcf86cd799439011/comments/456?include=user',
      ),
    ).toBe('/v1/videos/*/comments/*');
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
