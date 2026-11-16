import { PublishErrorKind } from '@genfeedai/contracts';
import {
  PublishError,
  readPublishErrorKind,
} from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';

/**
 * Network failures raised before a request leaves this server. The provider
 * never saw it, so nothing can have been published.
 */
const REQUEST_NEVER_SENT_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

export interface ClassifyHttpPublishErrorOptions {
  /**
   * Whether the request could have created the post on the provider. A server
   * error, timeout or dropped connection on such a request may hide an
   * accepted publish (`outcome_unknown`). On a request that creates nothing,
   * such as a token refresh or a media upload, the same failure proves
   * nothing was published (`retry_later`).
   */
  isPublishRequest: boolean;
  /** The provider's own error code, read from its response body. */
  providerCode?: string;
  /**
   * Replaces the error's message, and drops the original error as the cause.
   * For a caller that deliberately keeps provider text out of what it reports.
   */
  message?: string;
  /**
   * The kind for statuses the provider documents differently from the usual
   * reading. Return `undefined` to fall back to the default.
   */
  kindForStatus?: (status: number) => PublishErrorKind | undefined;
}

interface HttpFailure {
  code?: string;
  headers: unknown;
  status?: number;
}

function readHttpFailure(error: unknown): HttpFailure {
  if (!isRecord(error)) return { headers: undefined };
  const response = isRecord(error.response) ? error.response : undefined;
  const status = response?.status ?? error.statusCode ?? error.status;
  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    headers: response?.headers ?? error.headers,
    status: typeof status === 'number' ? status : undefined,
  };
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!isRecord(headers)) return undefined;
  const getter = headers.get;
  const value =
    typeof getter === 'function'
      ? getter.call(headers, name)
      : (headers[name] ?? headers[name.toLowerCase()]);
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;
}

/**
 * How long the provider said to wait, from a `Retry-After` header: a number of
 * seconds or an HTTP date. Undefined when the header is absent or unreadable.
 */
export function readRetryAfterMs(
  headers: unknown,
  now: Date = new Date(),
): number | undefined {
  const raw = readHeader(headers, 'retry-after')?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const resetAt = Date.parse(raw);
  return Number.isNaN(resetAt)
    ? undefined
    : Math.max(0, resetAt - now.getTime());
}

function kindForUnsentRequest(
  failure: HttpFailure,
  isPublishRequest: boolean,
): PublishErrorKind {
  if (!isPublishRequest) return PublishErrorKind.RETRY_LATER;
  return failure.code && REQUEST_NEVER_SENT_CODES.has(failure.code)
    ? PublishErrorKind.RETRY_LATER
    : PublishErrorKind.OUTCOME_UNKNOWN;
}

function defaultKindForStatus(
  status: number,
  isPublishRequest: boolean,
): PublishErrorKind {
  if (status === HTTP_UNAUTHORIZED) return PublishErrorKind.TOKEN_MUST_REFRESH;
  if (status === HTTP_FORBIDDEN) return PublishErrorKind.CHANNEL_DISCONNECTED;
  if (status === HTTP_TOO_MANY_REQUESTS) return PublishErrorKind.RATE_LIMITED;
  if (status === HTTP_REQUEST_TIMEOUT || status >= HTTP_SERVER_ERROR) {
    return isPublishRequest
      ? PublishErrorKind.OUTCOME_UNKNOWN
      : PublishErrorKind.RETRY_LATER;
  }
  return PublishErrorKind.CONTENT_REJECTED;
}

/**
 * Turns a failed provider HTTP call into the one error the publish worker
 * reads. A failure that already carries a kind passes through unchanged, so a
 * publisher can classify at the layer that knows the provider and let it
 * travel up.
 *
 * The kind comes from the HTTP status and the connection error code, never
 * from message text. A response with no status at all (a timeout, a reset
 * connection) leaves a publish request's outcome unknown.
 */
export function classifyHttpPublishError(
  error: unknown,
  options: ClassifyHttpPublishErrorOptions,
): PublishError {
  if (readPublishErrorKind(error)) return error as PublishError;

  const failure = readHttpFailure(error);
  const kind =
    failure.status === undefined
      ? kindForUnsentRequest(failure, options.isPublishRequest)
      : (options.kindForStatus?.(failure.status) ??
        defaultKindForStatus(failure.status, options.isPublishRequest));
  const message =
    options.message ??
    (error instanceof Error && error.message
      ? error.message
      : 'The provider request failed');

  return new PublishError(kind, message, {
    cause: options.message === undefined ? error : undefined,
    httpStatus: failure.status,
    providerCode: options.providerCode,
    retryAfterMs:
      kind === PublishErrorKind.RATE_LIMITED
        ? readRetryAfterMs(failure.headers)
        : undefined,
  });
}
