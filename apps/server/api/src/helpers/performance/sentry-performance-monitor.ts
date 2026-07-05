import type {
  ApiPerformanceSeverity,
  ApiPerformanceTelemetryInput,
  MetricAttributes,
  PerformanceMetrics,
} from '@api/shared/interfaces/performance/performance.interface';
import type { ConfigService } from '@libs/config/config.service';
import * as Sentry from '@sentry/nestjs';

type PerformanceConfig = Pick<ConfigService, 'get'>;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/i;

export function normalizeApiRoute(rawUrl: string): string {
  const [rawPath] = rawUrl.split('?');
  const path = rawPath || '/';
  const segments = path.replace(/\/+/g, '/').split('/').filter(Boolean);

  if (segments.length === 0) {
    return '/';
  }

  return `/${segments
    .map((segment, index) => {
      const decodedSegment = safelyDecodeSegment(segment);
      return isDynamicPathSegment(decodedSegment, index, segments.length)
        ? '*'
        : decodedSegment;
    })
    .join('/')}`;
}

export function isSentryPerformanceMetricsEnabled(
  configService: PerformanceConfig,
): boolean {
  return (
    configService.get('API_SENTRY_PERFORMANCE_METRICS') === 'true' ||
    configService.get('API_PERFORMANCE_AUDIT') === 'true'
  );
}

export function recordApiPerformanceTelemetry(
  input: ApiPerformanceTelemetryInput,
  configService: PerformanceConfig,
): void {
  try {
    const { databaseMetrics, errorMessage, metrics, severity } = input;
    const activeSpan = Sentry.getActiveSpan();
    const attributes = createMetricAttributes(metrics, severity);

    if (activeSpan) {
      activeSpan.setAttributes({
        'genfeed.api.db.query_count': databaseMetrics?.queryCount ?? 0,
        'genfeed.api.db.query_duration_ms': databaseMetrics?.queryDuration ?? 0,
        'genfeed.api.duration_ms': metrics.duration,
        'genfeed.api.performance_severity': severity,
        'genfeed.api.route': metrics.route,
        'http.request.method': metrics.method,
        'http.response.status_code': metrics.statusCode ?? 0,
      });

      Sentry.updateSpanName(activeSpan, `${metrics.method} ${metrics.route}`);

      if (metrics.statusCode) {
        Sentry.setHttpStatus(activeSpan, metrics.statusCode);
      }
    }

    Sentry.setTag('api.method', metrics.method);
    Sentry.setTag('api.route', metrics.route);
    Sentry.setTag('api.status_code', String(metrics.statusCode ?? 'unknown'));
    Sentry.setTag('api.performance_severity', severity);

    Sentry.setMeasurement(
      'api.request.duration',
      metrics.duration,
      'millisecond',
      activeSpan,
    );

    Sentry.setContext('api.performance', {
      duration: metrics.duration,
      method: metrics.method,
      route: metrics.route,
      severity,
      statusCode: metrics.statusCode,
    });

    if (databaseMetrics) {
      Sentry.setMeasurement(
        'api.db.query_duration',
        databaseMetrics.queryDuration,
        'millisecond',
        activeSpan,
      );
      Sentry.setMeasurement(
        'api.db.query_count',
        databaseMetrics.queryCount,
        'none',
        activeSpan,
      );
      Sentry.setContext('api.database', databaseMetrics);
    }

    if (errorMessage) {
      Sentry.setContext('api.error', {
        message: errorMessage,
      });
    }

    if (!isSentryPerformanceMetricsEnabled(configService)) {
      return;
    }

    Sentry.metrics.count('api.request.count', 1, {
      attributes,
    });
    Sentry.metrics.distribution('api.request.duration', metrics.duration, {
      attributes,
      unit: 'millisecond',
    });

    if (databaseMetrics) {
      Sentry.metrics.distribution(
        'api.db.query_duration',
        databaseMetrics.queryDuration,
        {
          attributes,
          unit: 'millisecond',
        },
      );
      Sentry.metrics.distribution(
        'api.db.query_count',
        databaseMetrics.queryCount,
        {
          attributes,
          unit: 'none',
        },
      );
    }
  } catch {
    // Request telemetry must never change request behavior.
  }
}

function createMetricAttributes(
  metrics: PerformanceMetrics,
  severity: ApiPerformanceSeverity,
): MetricAttributes {
  return {
    method: metrics.method,
    route: metrics.route,
    severity,
    status_code: String(metrics.statusCode ?? 'unknown'),
  };
}

function isDynamicPathSegment(
  segment: string,
  index: number,
  segmentCount: number,
): boolean {
  if (
    OBJECT_ID_PATTERN.test(segment) ||
    UUID_PATTERN.test(segment) ||
    ULID_PATTERN.test(segment) ||
    /^\d+$/.test(segment)
  ) {
    return true;
  }

  if (
    segment.length >= 16 &&
    /\d/.test(segment) &&
    /^[a-z0-9_-]+$/i.test(segment)
  ) {
    return true;
  }

  return (
    index === segmentCount - 1 &&
    segmentCount >= 3 &&
    SLUG_PATTERN.test(segment)
  );
}

function safelyDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
