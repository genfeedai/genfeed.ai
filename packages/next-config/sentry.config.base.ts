import * as Sentry from '@sentry/nextjs';

type TransactionEvent = Parameters<
  NonNullable<
    NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSendTransaction']
  >
>[0];

const QUERY_STRING_SPAN_KEYS = ['http.query', 'url.query'] as const;
const URL_SPAN_KEYS = ['http.url', 'url.full'] as const;

function withoutQueryString(url: string): string {
  const queryStart = url.search(/[?#]/);
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function scrubSpanData(data: Record<string, unknown> | undefined): void {
  if (!data) {
    return;
  }

  for (const key of QUERY_STRING_SPAN_KEYS) {
    delete data[key];
  }

  for (const key of URL_SPAN_KEYS) {
    const value = data[key];
    if (typeof value === 'string') {
      data[key] = withoutQueryString(value);
    }
  }
}

/**
 * Sampled request traces carry the request URL. Callback routes such as
 * `/oauth/[platform]` put one-time authorization codes in the query string,
 * which the SDK denylist does not recognise, so no query string leaves the app.
 */
export function stripQueryStringsFromTransaction(
  event: TransactionEvent,
): TransactionEvent {
  if (event.request) {
    if (event.request.url) {
      event.request.url = withoutQueryString(event.request.url);
    }
    delete event.request.query_string;
  }

  scrubSpanData(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) {
    scrubSpanData(span.data);
    if (span.description) {
      span.description = withoutQueryString(span.description);
    }
  }

  return event;
}

interface SentryInitOptions {
  /** Additional tags to include in all events */
  additionalTags?: Record<string, string>;
  /** Override debug mode (default: false) */
  debug?: boolean;
  /** Override enabled state (default: disabled in development) */
  enabled?: boolean;
  /** Share of requests traced for performance spans (default: 0, off) */
  tracesSampleRate?: number;
}

/**
 * Initialize Sentry for Next.js edge/server runtime.
 * Use in both sentry.edge.config.ts and sentry.server.config.ts
 *
 * @example
 * // sentry.edge.config.ts
 * import { initSentry } from '@configs/sentry.config.base';
 * initSentry();
 */
export function initSentry(options: SentryInitOptions = {}): void {
  const {
    additionalTags,
    debug = false,
    enabled = process.env.NODE_ENV !== 'development',
    tracesSampleRate = 0,
  } = options;

  Sentry.init({
    beforeSendTransaction: stripQueryStringsFromTransaction,
    debug,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    // Off unless the app opts in; the website stays error-reporting only.
    tracesSampleRate,
  });

  if (additionalTags) {
    Sentry.setTags(additionalTags);
  }
}
