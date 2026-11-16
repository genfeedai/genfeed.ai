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
