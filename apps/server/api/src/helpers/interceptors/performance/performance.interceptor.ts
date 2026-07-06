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
import type {
  ApiPerformanceSeverity,
  PerformanceMetrics,
} from '@api/shared/interfaces/performance/performance.interface';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly slowRequestThreshold = 1_000; // 1 second
  private readonly verySlowRequestThreshold = 5_000; // 5 seconds
  private readonly logSuccessfulRequests: boolean;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    @Optional() private readonly memoryMonitor?: MemoryMonitorService,
  ) {
    this.logSuccessfulRequests = configService.get('NODE_ENV') !== 'production';
  }

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

    const { method, url, headers, user } = request;
    const userAgent = headers['user-agent'];
    const userId = user?.id;

    const observable = next.handle().pipe(
      tap({
        error: (error: unknown) => {
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
    const shouldLogCompletion = this.logSuccessfulRequests && !error;
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
    const severity = this.readPerformanceSeverity(isSlow, isVerySlow, error);

    recordApiPerformanceTelemetry(
      {
        databaseMetrics,
        errorMessage: errorDetails?.message,
        metrics,
        severity,
      },
      this.configService,
    );

    if (!shouldLogCompletion && !isSlow && !isVerySlow && !error) {
      return;
    }

    // Check memory usage for slow requests
    const memoryStats =
      isSlow && this.memoryMonitor
        ? this.memoryMonitor.getMemoryStats()
        : undefined;

    // Log based on performance thresholds
    if (isVerySlow) {
      this.logger.warn('Very slow request detected', {
        ...metrics,
        severity,
        ...(databaseMetrics && { database: databaseMetrics }),
        ...(errorDetails?.message && { error: errorDetails.message }),
        ...(memoryStats && {
          memory: memoryStats,
          memoryWarning:
            memoryStats.heapUsedPercent > 80
              ? `High memory usage: ${memoryStats.heapUsedPercent}%`
              : undefined,
        }),
      });
    } else if (isSlow) {
      this.logger.warn('Slow request detected', {
        ...metrics,
        severity,
        ...(databaseMetrics && { database: databaseMetrics }),
        ...(errorDetails?.message && { error: errorDetails.message }),
        ...(memoryStats && {
          memory: memoryStats,
          memoryWarning:
            memoryStats.heapUsedPercent > 80
              ? `High memory usage: ${memoryStats.heapUsedPercent}%`
              : undefined,
        }),
      });
    } else if (shouldLogCompletion) {
      // Keep low-value request completion logs out of the production hot path.
      this.logger.debug('Request completed', {
        ...metrics,
        ...(databaseMetrics && { database: databaseMetrics }),
        severity,
        ...(errorDetails?.message && { error: errorDetails.message }),
      });
    }

    // Log error requests separately for easier monitoring
    if (error) {
      this.logger.error('Request failed', {
        ...metrics,
        ...(databaseMetrics && { database: databaseMetrics }),
        error: {
          message: errorDetails?.message,
          name: errorDetails?.name,
          stack: errorDetails?.stack,
        },
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

// Additional interceptor for API-specific metrics
@Injectable()
export class APIMetricsInterceptor implements NestInterceptor {
  private readonly logApiUsage: boolean;

  constructor(
    private readonly logger: LoggerService,
    logApiUsage?: boolean,
  ) {
    this.logApiUsage = logApiUsage ?? false;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.logApiUsage) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { method, url } = request;

    // Track API endpoint usage
    if (url.startsWith('/v1/')) {
      const endpoint = this.extractEndpoint(url);

      return next.handle().pipe(
        tap({
          next: () => {
            this.logger.debug('API endpoint accessed', {
              endpoint,
              method,
              timestamp: new Date().toISOString(),
              type: 'api_usage',
            });
          },
        }),
      );
    }

    return next.handle();
  }

  private extractEndpoint(url: string): string {
    return normalizeApiRoute(url);
  }
}
