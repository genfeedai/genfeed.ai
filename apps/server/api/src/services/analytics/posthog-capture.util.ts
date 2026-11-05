import type { ConfigService } from '@libs/config/config.service';
import { safeFetch } from '@libs/security/destination-guard';
import { traced } from '@libs/tracing/traced';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/**
 * Every server-side capture runs off the request path (fire-and-forget), so
 * the deadline only bounds how long a dropped event can hold a socket. 800 ms
 * was shorter than a cold round trip from us-west-1 to the EU ingest host and
 * dropped real `onboarding_completed` events (Sentry API-GENFEED-AI-9F).
 */
export const POSTHOG_CAPTURE_TIMEOUT_MS = 3000;

/**
 * Bounded failure categories. Never derived from an exception's message or
 * from response content, which can embed request or redirect data.
 */
export type PostHogCaptureFailureCategory =
  | 'invalid_destination'
  | 'non_2xx_response'
  | 'request_failed'
  | 'timeout';

export interface IPostHogCaptureEvent {
  distinctId: string;
  event: string;
  /** Any JSON-serialisable properties object; interfaces need no index signature. */
  properties: object;
}

export type PostHogCaptureResult =
  | { status: 'sent' }
  | { status: 'skipped' }
  | {
      status: 'failed';
      category: PostHogCaptureFailureCategory;
      httpStatus?: number;
    };

/**
 * Returns the configured PostHog host as-is (trimmed), or the public default
 * when the config is genuinely absent or empty. Any other explicit value,
 * including whitespace, is returned unchanged so validation rejects it rather
 * than silently substituting the default.
 */
function readHost(configService: Pick<ConfigService, 'get'>): string {
  const raw = configService.get('POSTHOG_HOST');
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_POSTHOG_HOST;
  }
  return String(raw).trim();
}

/** Parses the host and rejects anything but an HTTPS origin. */
function readHttpsOrigin(host: string): string {
  const parsed = new URL(host);
  if (parsed.protocol !== 'https:') {
    throw new Error('non-HTTPS POSTHOG_HOST');
  }
  return parsed.origin;
}

/** `AbortSignal.timeout` rejects with a `TimeoutError` DOMException. */
function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TimeoutError'
  );
}

/**
 * The one HTTP `capture` call (`/i/v0/e/`) every server-side PostHog event
 * goes through: funnel steps, LLM generation telemetry and typed-decision
 * telemetry. Never throws. Skips when no project key is configured or the
 * distinct id is empty; refuses a non-HTTPS or malformed `POSTHOG_HOST`
 * without sending; never follows a redirect, because a same-origin 3xx could
 * turn the POST into a bodyless GET that reports success.
 */
export const sendPostHogCapture = traced(
  'sendPostHogCapture',
  async (
    configService: Pick<ConfigService, 'get'>,
    { distinctId, event, properties }: IPostHogCaptureEvent,
  ): Promise<PostHogCaptureResult> => {
    const projectKey = String(
      configService.get('POSTHOG_PROJECT_API_KEY') || '',
    ).trim();
    if (!projectKey || !distinctId) {
      return { status: 'skipped' };
    }

    let host: string;
    let origin: string;
    try {
      const configuredHost = readHost(configService);
      origin = readHttpsOrigin(configuredHost);
      host = configuredHost.endsWith('/')
        ? configuredHost.slice(0, -1)
        : configuredHost;
    } catch {
      return { category: 'invalid_destination', status: 'failed' };
    }

    try {
      const response = await safeFetch(
        `${host}/i/v0/e/`,
        {
          body: JSON.stringify({
            api_key: projectKey,
            distinct_id: distinctId,
            event,
            properties,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(POSTHOG_CAPTURE_TIMEOUT_MS),
        },
        // Defense-in-depth: also rejects a redirect hop to a plaintext origin.
        { allowedOrigins: [origin], allowedSchemes: ['https:'] },
      );

      if (!response.ok) {
        return {
          category: 'non_2xx_response',
          httpStatus: response.status,
          status: 'failed',
        };
      }
      return { status: 'sent' };
    } catch (error) {
      return {
        category: isTimeout(error) ? 'timeout' : 'request_failed',
        status: 'failed',
      };
    }
  },
);
