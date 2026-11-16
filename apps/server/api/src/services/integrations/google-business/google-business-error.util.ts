import { isRecord } from '@genfeedai/utils/data/extract.util';

/** A refused Google Business Profile API call, read from the response. */
export class GoogleBusinessApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly googleStatus: string | null,
  ) {
    super(message);
    this.name = 'GoogleBusinessApiError';
  }

  /** The access token was refused; one refresh can fix it. */
  get isTokenRejected(): boolean {
    return this.status === 401;
  }

  /** The content or request can never succeed as sent. */
  get isRequestRejected(): boolean {
    return this.status === 400 || this.googleStatus === 'INVALID_ARGUMENT';
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/** Build a typed error from an axios-shaped failure. */
export function toGoogleBusinessApiError(
  error: unknown,
  action: string,
): GoogleBusinessApiError {
  const response =
    isRecord(error) && isRecord(error.response) ? error.response : null;
  const status =
    response && typeof response.status === 'number' ? response.status : null;
  const body = response && isRecord(response.data) ? response.data : null;
  const apiError = body && isRecord(body.error) ? body.error : null;
  const message =
    apiError && typeof apiError.message === 'string'
      ? apiError.message
      : error instanceof Error
        ? error.message
        : String(error);
  const googleStatus =
    apiError && typeof apiError.status === 'string' ? apiError.status : null;

  return new GoogleBusinessApiError(
    `Google Business Profile ${action} failed${status ? ` (${status})` : ''}: ${message}`,
    status,
    googleStatus,
  );
}

/**
 * A refresh the provider answered with `invalid_grant`: the grant was revoked,
 * expired or the account changed. Network errors and 5xx are not this.
 */
export function isGoogleBusinessGrantRevokedError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const response = isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : null;
  return (
    data?.error === 'invalid_grant' ||
    error.code === 'invalid_grant' ||
    (error instanceof Error && error.message.includes('invalid_grant'))
  );
}
