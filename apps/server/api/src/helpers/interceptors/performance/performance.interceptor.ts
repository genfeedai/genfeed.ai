import process from 'node:process';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { PerformanceMetrics } from '@api/shared/interfaces/performance/performance.interface';
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
  private readonly logSuccessfulRequests =
    process.env.NODE_ENV !== 'production';

  constructor(
    private readonly logger: LoggerService,
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

    const { method, url, headers, user } = request;
    const userAgent = headers['user-agent'];
    const userId = user?.id;

    return next.handle().pipe(
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

    if (!shouldLogCompletion && !isSlow && !isVerySlow && !error) {
      return;
    }

    const metrics: PerformanceMetrics = {
      duration,
      method,
      statusCode,
      timestamp: new Date().toISOString(),
      url,
      userAgent,
      userId,
    };

    // Check memory usage for slow requests
    const memoryStats =
      isSlow && this.memoryMonitor
        ? this.memoryMonitor.getMemoryStats()
        : undefined;
    const errorDetails = error ? this.readError(error) : undefined;

    // Log based on performance thresholds
    if (isVerySlow) {
      this.logger.warn('Very slow request detected', {
        ...metrics,
        severity: 'HIGH',
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
        severity: 'MEDIUM',
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
        severity: 'LOW',
        ...(errorDetails?.message && { error: errorDetails.message }),
      });
    }

    // Log error requests separately for easier monitoring
    if (error) {
      this.logger.error('Request failed', {
        ...metrics,
        error: {
          message: errorDetails?.message,
          name: errorDetails?.name,
          stack: errorDetails?.stack,
        },
      });
    }
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
    // Extract endpoint pattern (e.g., /v1/videos/:id becomes /v1/videos/*)
    return url
      .replace(/\/[0-9a-fA-F]{24}/g, '/*') // entity IDs
      .replace(/\/\d+/g, '/*') // Numeric IDs
      .replace(/\/[a-zA-Z0-9-_]+$/g, '/*'); // Generic IDs at the end
  }
}
