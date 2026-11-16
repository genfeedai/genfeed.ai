import { redactSensitiveString } from '@genfeedai/helpers/security/redact-sensitive-value.helper';
import type { Breadcrumb, NodeOptions } from '@sentry/nestjs';

const HYPHENS_PATTERN = /-/g;

/**
 * Share of production requests traced. Enough for per-route p50/p95 on the API
 * without paying span overhead or Sentry quota on every request.
 */
export const PRODUCTION_TRACES_SAMPLE_RATE = 0.05;

/**
 * Outbound HTTP breadcrumbs record the full request URL. Some providers carry
 * a secret in the URL path (Discord webhooks, Telegram bot tokens), so every
 * URL a breadcrumb holds goes through the shared redactor before it is kept.
 */
export function redactBreadcrumbUrls(breadcrumb: Breadcrumb): Breadcrumb {
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = redactSensitiveString(breadcrumb.message);
  }
  const data = breadcrumb.data;
  if (data) {
    for (const key of ['url', 'http.url', 'to', 'from']) {
      const value = data[key];
      if (typeof value === 'string') {
        data[key] = redactSensitiveString(value);
      }
    }
  }
  return breadcrumb;
}

interface SentryConfigOptions {
  serviceName: string;
}

export function getSentryConfig(
  options: SentryConfigOptions,
): NodeOptions | null {
  if (process.env.SENTRY_ENABLED === 'false') {
    return null;
  }

  // Skip Sentry + OTEL instrumentation in dev unless explicitly opted in.
  // 36 OTEL packages would otherwise load on every rebuild.
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.SENTRY_DEV !== 'true'
  ) {
    return null;
  }

  const dsn =
    process.env[
      `SENTRY_DSN_${options.serviceName.toUpperCase().replace(HYPHENS_PATTERN, '_')}`
    ] || process.env.SENTRY_DSN;

  if (!dsn) {
    return null;
  }

  return {
    beforeBreadcrumb: redactBreadcrumbUrls,
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    // Send W3C `traceparent` beside `sentry-trace` and `baggage` so services
    // that only speak OpenTelemetry continue our traces.
    propagateTraceparent: true,
    release: process.env.npm_package_version || '1.0.0',
    // Never attach request bodies or IP/user defaults — prompt text must not
    // ride Sentry events in any environment, including staging and local opt-in.
    dataCollection: {
      cookies: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
      httpBodies: [],
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      queues: false,
      urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      userInfo: false,
    },
    // Production samples request traces for route latency; every other
    // environment stays at zero so dev and CI never emit spans.
    tracesSampleRate:
      process.env.NODE_ENV === 'production' ? PRODUCTION_TRACES_SAMPLE_RATE : 0,
  };
}
