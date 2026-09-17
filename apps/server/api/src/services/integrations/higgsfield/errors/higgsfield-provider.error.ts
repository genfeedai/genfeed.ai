import { AgentFailureReason } from '@genfeedai/contracts';

/**
 * Typed failure raised when the Higgsfield platform rejects a request or
 * returns a terminal non-success status. Callers classify on `reason` /
 * `isRetryable` instead of matching on the message, the same way
 * {@link ReplicateProviderError} is consumed.
 */
export class HiggsFieldProviderError extends Error {
  readonly reason: AgentFailureReason;
  readonly isRetryable: boolean;
  readonly statusCode?: number;

  constructor(
    reason: AgentFailureReason,
    message: string,
    options: { isRetryable: boolean; statusCode?: number },
  ) {
    super(message);
    this.name = HiggsFieldProviderError.name;
    this.reason = reason;
    this.isRetryable = options.isRetryable;
    this.statusCode = options.statusCode;
  }
}

/**
 * Reads the HTTP status off a transport error, whether it is shaped like an
 * Axios error (`response.status`) or carries the code directly.
 */
export function readHttpStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const response = (error as { response?: { status?: unknown } }).response;
  if (response && typeof response === 'object') {
    const responseStatus = (response as { status?: unknown }).status;
    if (typeof responseStatus === 'number') {
      return responseStatus;
    }
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Renders the platform's `detail` payload, which is either a string or FastAPI's
 * array of validation objects, into something an operator can read.
 */
function formatDetail(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const response = (error as { response?: { data?: unknown } }).response;
  const data =
    response && typeof response === 'object' ? response.data : undefined;
  const detail =
    data && typeof data === 'object'
      ? (data as { detail?: unknown }).detail
      : data;

  if (detail === undefined || detail === null) {
    return '';
  }

  if (typeof detail === 'string') {
    return `: ${detail}`;
  }

  try {
    return `: ${JSON.stringify(detail)}`;
  } catch {
    return '';
  }
}

/**
 * Maps a transport error onto a typed provider error. The status codes follow
 * the official SDK's interceptor: 401 invalid credentials, 403 out of credit,
 * 400/422 bad input, 429 rate limited.
 */
export function toHiggsFieldProviderError(error: unknown): Error {
  if (error instanceof HiggsFieldProviderError) {
    return error;
  }

  const statusCode = readHttpStatusCode(error);

  if (statusCode === 401) {
    return new HiggsFieldProviderError(
      AgentFailureReason.PROVIDER_AUTHENTICATION,
      'Higgsfield rejected the API credentials.',
      { isRetryable: false, statusCode },
    );
  }

  if (statusCode === 403) {
    return new HiggsFieldProviderError(
      AgentFailureReason.INSUFFICIENT_CREDITS,
      'Higgsfield rejected the request due to insufficient credit.',
      { isRetryable: false, statusCode },
    );
  }

  if (statusCode === 400 || statusCode === 422) {
    return new HiggsFieldProviderError(
      AgentFailureReason.ACTION_NOT_ALLOWED,
      'Higgsfield rejected the request input.',
      { isRetryable: false, statusCode },
    );
  }

  if (statusCode === 429) {
    return new HiggsFieldProviderError(
      AgentFailureReason.RATE_LIMITED,
      'Higgsfield rate limited the request.',
      { isRetryable: true, statusCode },
    );
  }

  // Any other HTTP status still carries its code and the platform's own
  // `detail`. Falling through to `String(error)` here rendered an Axios-shaped
  // plain object as "[object Object]", which told an operator nothing.
  if (statusCode !== undefined) {
    return new HiggsFieldProviderError(
      statusCode >= 500
        ? AgentFailureReason.PROVIDER_UNAVAILABLE
        : AgentFailureReason.PROVIDER_CONFIGURATION,
      `Higgsfield returned HTTP ${statusCode}${formatDetail(error)}.`,
      { isRetryable: statusCode >= 500, statusCode },
    );
  }

  return error instanceof Error
    ? error
    : new Error(`Higgsfield request failed${formatDetail(error)}.`);
}
