import { isAxiosError } from '@genfeedai/utils/error/json-api-status.util';

/** AT Protocol error names a PDS sends when it refuses the account itself. */
const CREDENTIAL_REJECTION_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AccountDeactivated',
  'AccountTakedown',
  'AuthenticationRequired',
]);

/** AT Protocol error names for a session token that needs replacing. */
const SESSION_TOKEN_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ExpiredToken',
  'InvalidToken',
]);

const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Thrown when Bluesky refuses the stored app password or the account. The
 * channel has already been marked disconnected when this is thrown, and
 * retrying cannot help until the owner reconnects.
 */
export class BlueskyCredentialRejectedError extends Error {
  readonly code = 'credential_rejected';

  constructor(message = 'Bluesky rejected the connected account.') {
    super(message);
    this.name = 'BlueskyCredentialRejectedError';
  }
}

/** The `error` name in an XRPC error body, e.g. `ExpiredToken`. */
function readBlueskyErrorName(error: unknown): string | undefined {
  if (!isAxiosError(error)) {
    return undefined;
  }
  const data: unknown = error.response?.data;
  if (data !== null && typeof data === 'object' && 'error' in data) {
    const name = (data as { error?: unknown }).error;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

/** True when `createSession` refused the handle, app password or account. */
export function isBlueskyCredentialRejection(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  const name = readBlueskyErrorName(error);
  return (
    status === HTTP_UNAUTHORIZED ||
    (name !== undefined && CREDENTIAL_REJECTION_ERROR_NAMES.has(name))
  );
}

/** True when an authenticated call failed because its session token lapsed. */
export function isBlueskySessionTokenError(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  const name = readBlueskyErrorName(error);
  return (
    (status === HTTP_BAD_REQUEST || status === HTTP_UNAUTHORIZED) &&
    name !== undefined &&
    SESSION_TOKEN_ERROR_NAMES.has(name)
  );
}

/**
 * Thrown when a media file cannot become a Bluesky blob (unreadable, too large,
 * wrong type). The file will not change on retry, so the post fails for good.
 */
export class BlueskyMediaError extends Error {
  readonly code = 'media_rejected';

  constructor(message: string) {
    super(message);
    this.name = 'BlueskyMediaError';
  }
}

/**
 * How long Bluesky said to wait after a 429, or null when the error is not a
 * rate limit. A PDS sends `retry-after` (seconds) and `ratelimit-reset`
 * (unix seconds); the wait is 0 when it gave neither.
 */
export function readBlueskyRateLimit(
  error: unknown,
): { resetAt?: Date; retryAfterMs: number } | null {
  if (
    !isAxiosError(error) ||
    error.response?.status !== HTTP_TOO_MANY_REQUESTS
  ) {
    return null;
  }
  const headers: Record<string, unknown> = error.response.headers ?? {};
  const retryAfter = Number(headers['retry-after']);
  const reset = Number(headers['ratelimit-reset']);
  const resetAt = Number.isFinite(reset)
    ? new Date(reset * MILLISECONDS_PER_SECOND)
    : undefined;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return { resetAt, retryAfterMs: retryAfter * MILLISECONDS_PER_SECOND };
  }
  return {
    resetAt,
    retryAfterMs: resetAt ? Math.max(0, resetAt.getTime() - Date.now()) : 0,
  };
}
