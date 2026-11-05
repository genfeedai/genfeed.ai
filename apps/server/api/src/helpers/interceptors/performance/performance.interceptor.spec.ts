import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PerformanceInterceptor } from '@api/helpers/interceptors/performance/performance.interceptor';
import { recordPrismaQuery } from '@api/helpers/performance/request-performance.context';
import { normalizeApiRoute } from '@api/helpers/performance/sentry-performance-monitor';
import { ConfigService } from '@libs/config/config.service';
import { runWithWideEvent } from '@libs/logger/wide-event/wide-event.context';
import type { WideEventRecord } from '@libs/logger/wide-event/wide-event.interface';
import { startWideEvent } from '@libs/logger/wide-event/wide-event.lifecycle';
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
  let wideEvent: WideEventRecord;

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
      ],
    }).compile();

    interceptor = module.get<PerformanceInterceptor>(PerformanceInterceptor);
    wideEvent = startWideEvent({
      identity: { service: 'api' },
      kind: 'http',
      requestId: 'req-1',
      trace: { spanId: 'span-1', traceId: 'trace-1' },
    }).event;

    mockExecutionContext.getRequest.mockReturnValue(mockRequest);
    mockExecutionContext.getResponse.mockReturnValue(mockResponse);
    mockCallHandler.handle.mockReset();
  });

  /** Runs the interceptor the way the API does: inside the request's wide event. */
  function interceptRequest(): Promise<unknown> {
    return runWithWideEvent(wideEvent, () =>
      firstValueFrom(
        interceptor.intercept(mockExecutionContext, mockCallHandler),
      ),
    );
  }

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it.each([
      '/v1/workflow-executions/run-not-persisted',
      '/v1/workflow-executions/run-not-persisted?include=accounting',
    ])(
      'keeps the expected execution lookup miss off the wide event error: %s',
      async (url) => {
        const error = new NotFoundException('Execution');
        mockExecutionContext.getRequest.mockReturnValue({
          ...mockRequest,
          url,
        });
        mockCallHandler.handle.mockReturnValue(throwError(() => error));
        await expect(interceptRequest()).rejects.toBe(error);
        expect(wideEvent.error).toBeUndefined();
        expect(Sentry.setTag).toHaveBeenCalledWith('api.status_code', '404');
        expect(Sentry.setTag).not.toHaveBeenCalledWith(
          'api.performance_severity',
          'ERROR',
        );
      },
    );

    it('retains the slow severity for an expected execution lookup miss', async () => {
      const error = new NotFoundException('Execution');
      mockExecutionContext.getRequest.mockReturnValue({
        ...mockRequest,
        url: '/v1/workflow-executions/run-not-persisted',
      });
      mockCallHandler.handle.mockReturnValue(throwError(() => error));
      const clock = vi
        .spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValue(6000);
      try {
        await expect(interceptRequest()).rejects.toBe(error);
        expect(wideEvent.performance_severity).toBe('HIGH');
        expect(wideEvent.error).toBeUndefined();
      } finally {
        clock.mockRestore();
      }
    });

    it.each([
      ['GET', '/v1/workflow-executions/run-1', 500],
      ['GET', '/v1/workflow-executions/run-1', 403],
      ['POST', '/v1/workflow-executions/run-1', 404],
      ['GET', '/v1/workflow-executions/run-1/steps', 404],
      ['GET', '/v1/posts/post-1', 404],
    ])(
      'records the error on the wide event for %s %s (%i)',
      async (method, url, status) => {
        const error = Object.assign(new Error('Request failed'), { status });
        mockExecutionContext.getRequest.mockReturnValue({
          ...mockRequest,
          method,
          url,
        });
        mockCallHandler.handle.mockReturnValue(throwError(() => error));
        await expect(interceptRequest()).rejects.toBe(error);
        expect(wideEvent.error).toMatchObject({
          message: 'Request failed',
          status,
          type: 'Error',
        });
      },
    );

    it('marks fast successful requests as low severity', async () => {
      mockCallHandler.handle.mockReturnValue(of('success'));

      await interceptRequest();

      expect(wideEvent.performance_severity).toBe('LOW');
      expect(wideEvent.error).toBeUndefined();
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

    it('reports a request that finishes as 401 without throwing to Sentry', async () => {
      mockExecutionContext.getResponse.mockReturnValue({ statusCode: 401 });
      mockCallHandler.handle.mockReturnValue(of('unauthorized'));

      await interceptRequest();

      expect(Sentry.setTag).toHaveBeenCalledWith('api.status_code', '401');
      expect(wideEvent.error).toBeUndefined();
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

      await interceptRequest();

      expect(wideEvent.database).toEqual({
        query_count: 1,
        query_duration_ms: 150,
        slow_queries: [
          {
            duration_ms: 150,
            fingerprint: 'SELECT * FROM ? WHERE ? = ?',
            target: 'prisma:query',
          },
        ],
      });
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
        url: '/v1/videos/aaaaaaaaaaaaaaaaaaaaaaaa?include=comments',
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

      await interceptRequest();

      expect(wideEvent.performance_severity).toBe('LOW');
    });

    it.each([
      ['slow', 2001, 'MEDIUM'],
      ['very slow', 7000, 'HIGH'],
    ])(
      'marks %s requests with %s severity',
      async (_label, endTime, severity) => {
        mockCallHandler.handle.mockReturnValue(of('success'));
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValueOnce(1000)
          .mockReturnValue(endTime);
        try {
          await interceptRequest();
        } finally {
          clock.mockRestore();
        }

        expect(wideEvent.performance_severity).toBe(severity);
      },
    );

    it('records a thrown error with its status, type and message', async () => {
      const error = Object.assign(new Error('Test error'), { status: 400 });
      mockCallHandler.handle.mockReturnValue(throwError(() => error));

      await interceptRequest().catch(() => undefined);

      expect(wideEvent.error).toMatchObject({
        message: 'Test error',
        status: 400,
        type: 'Error',
      });
      expect(wideEvent.performance_severity).toBe('ERROR');
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
    expect(normalizeApiRoute('/v1/videos/aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(
      '/v1/videos/*',
    );
    expect(normalizeApiRoute('/v1/users/123')).toBe('/v1/users/*');
    expect(normalizeApiRoute('/v1/posts/my-post-slug')).toBe('/v1/posts/*');
    expect(
      normalizeApiRoute(
        '/v1/videos/aaaaaaaaaaaaaaaaaaaaaaaa/comments/456?include=user',
      ),
    ).toBe('/v1/videos/*/comments/*');
  });
});

describe('PerformanceInterceptor dormant diagnostic callbacks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(
      globalThis,
      Symbol.for('genfeed.cloudTenantGuard.observer.v1'),
    );
  });
  it('observes each value and cancellation without adding handler subscriptions or changing failures', async () => {
    const key = Symbol.for('genfeed.cloudTenantGuard.observer.v1');
    for (const [name, value] of Object.entries({
      CLOUD_SWEEP_DIAGNOSTICS: '1',
      CI: 'true',
      GITHUB_ACTIONS: 'true',
      GENFEED_CLOUD: 'true',
      NODE_ENV: 'test',
    }))
      vi.stubEnv(name, value);
    vi.stubEnv('CLOUD_SWEEP_LOCAL', undefined);
    const observer = {
      protocol: 1,
      bindRequest: vi.fn((_request: unknown, next: () => void) => next),
      tenantFailure: vi.fn(),
      ingress: vi.fn(),
      pipelineEnter: vi.fn(() => 1),
      pipelineNext: vi.fn(() => {
        throw new Error('observer failure');
      }),
      pipelineError: vi.fn(() => {
        throw new Error('observer failure');
      }),
      pipelineFinalize: vi.fn(),
      unavailable: vi.fn(),
    };
    Reflect.set(globalThis, key, observer);
    const config = {
      get: (name: string) => (name === 'NODE_ENV' ? 'test' : undefined),
    } as unknown as ConfigService;
    const instance = new PerformanceInterceptor(config);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/synthetic', headers: {} }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
    let subscriptions = 0;
    const next = {
      handle: () =>
        new Observable<string>((subscriber) => {
          subscriptions++;
          subscriber.next('first');
          subscriber.next('second');
          subscriber.complete();
        }),
    };
    expect(await firstValueFrom(instance.intercept(context, next))).toBe(
      'first',
    );
    expect(subscriptions).toBe(1);
    expect(observer.pipelineFinalize).toHaveBeenCalledTimes(1);
    expect(observer.unavailable).toHaveBeenCalled();
    const failure = new Error('unchanged handler');
    await expect(
      firstValueFrom(
        instance.intercept(context, {
          handle: () => throwError(() => failure),
        }),
      ),
    ).rejects.toBe(failure);
    expect(observer.pipelineError).toHaveBeenCalledTimes(1);
  });
});
