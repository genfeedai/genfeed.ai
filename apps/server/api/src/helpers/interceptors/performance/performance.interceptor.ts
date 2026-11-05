import {
  getCloudTenantObserver,
  observeCloudTenant,
} from '@api/helpers/cloud-tenant-diagnostics/cloud-tenant-diagnostics';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import {
  createRequestPerformanceStore,
  getRequestDatabaseMetrics,
  isPrismaQueryMetricsEnabled,
  runWithRequestPerformance,
} from '@api/helpers/performance/request-performance.context';
import {
  normalizeApiRoute,
  recordApiPerformanceTelemetry,
} from '@api/helpers/performance/sentry-performance-monitor';
import { redactEmailTrackingUrl } from '@api/helpers/utils/email-tracking-url.util';
import type {
  ApiPerformanceSeverity,
  PerformanceMetrics,
} from '@api/shared/interfaces/performance/performance.interface';
import { ConfigService } from '@libs/config/config.service';
import {
  enrichWideEvent,
  recordWideEventError,
} from '@libs/logger/wide-event/wide-event.context';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

/**
 * Adds request performance to the request's wide event (database work, memory
 * pressure on slow requests, the caught error) and reports the same metrics to
 * Sentry. It writes no log lines: the wide event is the one record of the
 * request, emitted by the wide-event middleware when the response finishes.
 */
@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly slowRequestThreshold = 1_000; // 1 second
  private readonly verySlowRequestThreshold = 5_000; // 5 seconds

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly memoryMonitor?: MemoryMonitorService,
  ) {}

  private readError(error: unknown): {
    message?: string;
    name?: string;
    stack?: string;
    status?: number;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        name: error.name,
        stack: error.stack,
        status: (error as Error & { status?: number }).status,
      };
    }

    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;
      return {
        message:
          typeof record.message === 'string' ? record.message : undefined,
        name: typeof record.name === 'string' ? record.name : undefined,
        stack: typeof record.stack === 'string' ? record.stack : undefined,
        status: typeof record.status === 'number' ? record.status : undefined,
      };
    }

    return {};
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const observer = getCloudTenantObserver();
    const entry = observeCloudTenant(observer, (value) =>
      value.pipelineEnter(request),
    );
    const { method, headers, user } = request;
    const url = redactEmailTrackingUrl(String(request.url ?? ''));
    const userAgent = headers['user-agent'];
    const userId = user?.id;

    const observable = next.handle().pipe(
      tap({
        error: (error: unknown) => {
          if (entry !== undefined)
            observeCloudTenant(observer, (value) =>
              value.pipelineError(request, entry, error),
            );
          const errorDetails = this.readError(error);
          this.logPerformance(
            now,
            method,
            url,
            errorDetails.status ?? 500,
            userAgent,
            userId,
            error,
          );
        },
        next: () => {
          if (entry !== undefined)
            observeCloudTenant(observer, (value) =>
              value.pipelineNext(request, entry),
            );
          this.logPerformance(
            now,
            method,
            url,
            response.statusCode,
            userAgent,
            userId,
          );
        },
      }),
      finalize(() => {
        if (entry !== undefined)
          observeCloudTenant(observer, (value) =>
            value.pipelineFinalize(request, entry),
          );
      }),
    );

    if (!isPrismaQueryMetricsEnabled(this.configService)) {
      return observable;
    }

    const store = createRequestPerformanceStore();
    return new Observable<unknown>((subscriber) => {
      return runWithRequestPerformance(store, () => {
        const subscription = observable.subscribe({
          complete: () => {
            subscriber.complete();
          },
          error: (error: unknown) => {
            subscriber.error(error);
          },
          next: (value: unknown) => {
            subscriber.next(value);
          },
        });

        return () => {
          subscription.unsubscribe();
        };
      });
    });
  }

  private logPerformance(
    startTime: number,
    method: string,
    url: string,
    statusCode: number,
    userAgent?: string,
    userId?: string,
    error?: unknown,
  ) {
    const duration = Date.now() - startTime;
    const isSlow = duration > this.slowRequestThreshold;
    const isVerySlow = duration > this.verySlowRequestThreshold;
    const metrics: PerformanceMetrics = {
      duration,
      method,
      route: normalizeApiRoute(url),
      statusCode,
      timestamp: new Date().toISOString(),
      url,
      userAgent,
      userId,
    };
    const databaseMetrics = getRequestDatabaseMetrics();
    const errorDetails = error ? this.readError(error) : undefined;
    const isExpectedExecutionLookupMiss =
      error !== undefined &&
      method === 'GET' &&
      statusCode === 404 &&
      /^(?:\/v1)?\/workflow-executions\/[^/]+\/?$/.test(url.split('?')[0]);
    const severity = this.readPerformanceSeverity(
      isSlow,
      isVerySlow,
      isExpectedExecutionLookupMiss ? undefined : error,
    );

    recordApiPerformanceTelemetry(
      {
        databaseMetrics,
        errorMessage: errorDetails?.message,
        metrics,
        severity,
      },
      this.configService,
    );

    // Memory pressure is only worth its cost when the request was slow.
    const memoryStats =
      isSlow && this.memoryMonitor
        ? this.memoryMonitor.getMemoryStats()
        : undefined;

    enrichWideEvent({
      database: databaseMetrics && {
        query_count: databaseMetrics.queryCount,
        query_duration_ms: databaseMetrics.queryDuration,
        slow_queries: databaseMetrics.slowQueries.map((query) => ({
          duration_ms: query.duration,
          fingerprint: query.fingerprint,
          target: query.target,
        })),
      },
      memory: memoryStats && {
        heap_used_mb: memoryStats.heapUsedMB,
        heap_used_percent: memoryStats.heapUsedPercent,
        rss_mb: memoryStats.rssMB,
      },
      performance_severity: severity,
    });

    if (error && !isExpectedExecutionLookupMiss) {
      recordWideEventError(error, {
        status: errorDetails?.status ?? statusCode,
      });
    }
  }

  private readPerformanceSeverity(
    isSlow: boolean,
    isVerySlow: boolean,
    error?: unknown,
  ): ApiPerformanceSeverity {
    if (error) {
      return 'ERROR';
    }

    if (isVerySlow) {
      return 'HIGH';
    }

    if (isSlow) {
      return 'MEDIUM';
    }

    return 'LOW';
  }
}
