import {
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
} from '@atproto/oauth-client-node';
import { isAxiosError } from '@genfeedai/utils/error/json-api-status.util';

/** AT Protocol error names a PDS sends when it refuses the account itself. */
const CREDENTIAL_REJECTION_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AccountDeactivated',
  'AccountTakedown',
  'AuthenticationRequired',
]);

const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Thrown when Bluesky refuses or revokes the stored session or the account. The
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

/** A non-2xx answer to a signed XRPC call, with what the rate-limit and rejection checks read. */
export class BlueskyHttpError extends Error {
  constructor(
    readonly status: number,
    readonly errorName: string | undefined,
    message: string,
    readonly headers: Record<string, string>,
  ) {
    super(message);
    this.name = 'BlueskyHttpError';
  }

  static fromResponse(response: Response, body: unknown): BlueskyHttpError {
    const fields =
      body !== null && typeof body === 'object'
        ? (body as { error?: unknown; message?: unknown })
        : {};
    const errorName =
      typeof fields.error === 'string' ? fields.error : undefined;
    const message =
      typeof fields.message === 'string'
        ? fields.message
        : `Bluesky answered ${response.status}`;
    return new BlueskyHttpError(
      response.status,
      errorName,
      message,
      Object.fromEntries(response.headers.entries()),
    );
  }
}

interface BlueskyErrorFacts {
  headers: Record<string, unknown>;
  name?: string;
  status?: number;
}

/** What an error says about the answer: from a signed call or an unsigned axios one. */
function describeBlueskyError(error: unknown): BlueskyErrorFacts | null {
  if (error instanceof BlueskyHttpError) {
    return {
      headers: error.headers,
      name: error.errorName,
      status: error.status,
    };
  }
  if (!isAxiosError(error)) {
    return null;
  }
  const data: unknown = error.response?.data;
  const name =
    data !== null && typeof data === 'object' && 'error' in data
      ? (data as { error?: unknown }).error
      : undefined;
  return {
    headers: error.response?.headers ?? {},
    name: typeof name === 'string' ? name : undefined,
    status: error.response?.status,
  };
}

/**
 * True when the stored session can no longer be opened: the person revoked
 * access at Bluesky, the refresh token ran out, or the server no longer accepts
 * this client. Retrying cannot help until the account is connected again.
 */
export function isBlueskySessionLost(error: unknown): boolean {
  return (
    error instanceof TokenRefreshError ||
    error instanceof TokenRevokedError ||
    error instanceof TokenInvalidError
  );
}

/** True when an answer from Bluesky refuses the account or the session. */
export function isBlueskyCredentialRejection(error: unknown): boolean {
  const facts = describeBlueskyError(error);
  if (!facts) {
    return false;
  }
  return (
    facts.status === HTTP_UNAUTHORIZED ||
    (facts.name !== undefined &&
      CREDENTIAL_REJECTION_ERROR_NAMES.has(facts.name))
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
  const facts = describeBlueskyError(error);
  if (facts?.status !== HTTP_TOO_MANY_REQUESTS) {
    return null;
  }
  const headers = facts.headers;
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
