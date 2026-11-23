import { logger } from '@genfeedai/services/core/logger.service';
import { ContextAuthenticationTokenUnavailableError } from '../internal/context-authed-service';
import {
  errorStatusOf,
  type RoutedOrganizationMismatchReason,
  VERIFICATION_FAILED_MESSAGE,
} from './organization-controller';

const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** What made a switch fail, without carrying any payload into the report. */
type RoutedOrganizationFailure =
  | 'auth'
  | 'network'
  | 'timeout'
  | 'unknown'
  | 'verification';

/**
 * What `fetch` itself rejects with when the request never got a response,
 * which the auth token exchange lets through unwrapped. In production the
 * Sentry fetch instrumentation appends the request host to these messages,
 * as in `Failed to fetch (api.example.com)`.
 */
const FETCH_TRANSPORT_MESSAGE =
  /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource|Network request failed)\.?( \([^)]+\))?$/;

function classifyFailure(error: unknown): RoutedOrganizationFailure {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (record.isNetworkError === true) return 'network';
    if (record.isTimeout === true) return 'timeout';
    if (record.isAuthError === true) return 'auth';
  }
  if (error instanceof ContextAuthenticationTokenUnavailableError) {
    return 'auth';
  }
  if (
    error instanceof TypeError &&
    FETCH_TRANSPORT_MESSAGE.test(error.message)
  ) {
    return 'network';
  }
  return error instanceof Error && error.message === VERIFICATION_FAILED_MESSAGE
    ? 'verification'
    : 'unknown';
}

/**
 * The error's class name, so an `unknown` failure can be told apart in Sentry.
 * Only a short identifier is kept; the message and any payload stay out. A
 * rejection that is not an `Error` (the production interceptor rethrows a
 * JSON:API response body as is) is named `NonError`.
 */
function errorNameOf(error: unknown): string | undefined {
  if (!(error instanceof Error)) return 'NonError';
  return ERROR_NAME_PATTERN.test(error.name) ? error.name : undefined;
}

export function emitSanitizedMismatch(
  reason: RoutedOrganizationMismatchReason,
  error?: unknown,
): void {
  const failure = error === undefined ? undefined : classifyFailure(error);
  const errorName = failure === 'unknown' ? errorNameOf(error) : undefined;
  const errorStatus = failure === 'unknown' ? errorStatusOf(error) : undefined;
  // A request that never reached the server (offline, aborted by a
  // navigation, timed out) says nothing about which organization is active,
  // so it is logged with its cause but is not a context mismatch to alert on.
  const isTransportFailure = failure === 'network' || failure === 'timeout';
  logger.warn('Routed organization context mismatch', {
    reportToSentry:
      (reason === 'cross-tab-sync-failed' || reason === 'switch-failed') &&
      !isTransportFailure,
    tags: {
      eventType: 'organization-context-mismatch',
      ...(failure ? { failure } : {}),
      ...(errorName ? { errorName } : {}),
      ...(errorStatus ? { errorStatus } : {}),
      reason,
    },
  });
}
