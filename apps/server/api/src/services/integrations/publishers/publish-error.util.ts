import { PublishErrorKind } from '@genfeedai/contracts';
import { isPublishError, PublishError } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';

/** What a thrown provider failure says, read once so a mapper can switch on it. */
export interface ProviderFailure {
  /** HTTP status of the provider response, when there was one. */
  httpStatus?: number;
  /** Response headers, lower-cased. */
  headers: Record<string, unknown>;
  /** Node or axios error code such as `ECONNRESET`, when there was one. */
  networkCode?: string;
  /** The error the provider call threw. */
  cause: unknown;
}

/**
 * A provider's mapper. It returns a kind for a failure it recognises from the
 * provider's documented codes, or null to leave the failure to the HTTP status.
 */
export type ProviderErrorMapper = (
  failure: ProviderFailure,
) => ProviderErrorVerdict | null;

export interface ProviderErrorVerdict {
  /** Omitted when the provider's code is read but decides nothing. */
  kind?: PublishErrorKind;
  /** The provider's own error code or reason, kept on the error. */
  providerCode?: string;
  retryAfterMs?: number;
  resetAt?: Date;
}

/** The request never reached the provider, so nothing was published. */
const NOT_SENT_NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/** The request may have reached the provider and been accepted. */
const MAYBE_SENT_NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'EPIPE',
  'ERR_CANCELED',
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const MAYBE_SENT_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AbortError',
  'TimeoutError',
]);

function readStatus(error: Record<string, unknown>): number | undefined {
  const response = isRecord(error.response) ? error.response : undefined;
  const status = response?.status ?? error.status ?? error.statusCode;
  return typeof status === 'number' && Number.isFinite(status)
    ? status
    : undefined;
}

function readHeaders(error: Record<string, unknown>): Record<string, unknown> {
  const response = isRecord(error.response) ? error.response : undefined;
  const headers = response?.headers;
  if (!isRecord(headers)) return {};
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

/** Reads what an axios or googleapis failure says; any field may be absent. */
export function readProviderFailure(error: unknown): ProviderFailure {
  const record = isRecord(error) ? error : {};
  return {
    cause: error,
    headers: readHeaders(record),
    httpStatus: readStatus(record),
    networkCode: typeof record.code === 'string' ? record.code : undefined,
  };
}

function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed)
    ? parsed
    : undefined;
}

/**
 * How long the provider said to wait, from `Retry-After` (seconds or an HTTP
 * date) or from a reset header holding the seconds until the window ends. Reddit
 * documents `X-Ratelimit-Reset` that way, and Pinterest's rate-limit page shows
 * `x-ratelimit-reset` with the same shape. Undefined when it gave none.
 */
export function readProviderRetryAfterMs(
  failure: ProviderFailure,
  now: Date = new Date(),
): number | undefined {
  const retryAfter = failure.headers['retry-after'];
  const seconds = readNumber(retryAfter);
  if (seconds !== undefined && seconds >= 0) return seconds * 1000;
  if (typeof retryAfter === 'string') {
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - now.getTime());
  }
  const resetSeconds =
    readNumber(failure.headers['x-ratelimit-reset']) ??
    readNumber(failure.headers['x-rate-limit-reset']);
  return resetSeconds !== undefined && resetSeconds >= 0
    ? resetSeconds * 1000
    : undefined;
}

/** What an HTTP status alone says about the publish. */
function kindFromStatus(status: number): PublishErrorKind | null {
  if (status === 429) return PublishErrorKind.RATE_LIMITED;
  if (status === 401) return PublishErrorKind.TOKEN_MUST_REFRESH;
  if (status === 403) return PublishErrorKind.CHANNEL_DISCONNECTED;
  // A timeout or a server fault may hide a publish the provider accepted.
  if (status === 408 || status >= 500) return PublishErrorKind.OUTCOME_UNKNOWN;
  if (status >= 400) return PublishErrorKind.CONTENT_REJECTED;
  return null;
}

function kindFromTransport(failure: ProviderFailure): PublishErrorKind | null {
  const { networkCode, cause } = failure;
  if (networkCode && NOT_SENT_NETWORK_CODES.has(networkCode)) {
    return PublishErrorKind.RETRY_LATER;
  }
  const name = isRecord(cause) ? cause.name : undefined;
  if (
    (networkCode && MAYBE_SENT_NETWORK_CODES.has(networkCode)) ||
    (typeof name === 'string' && MAYBE_SENT_ERROR_NAMES.has(name))
  ) {
    return PublishErrorKind.OUTCOME_UNKNOWN;
  }
  return null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Publish failed';
}

/**
 * The `PublishError` for a failure a provider call threw. A provider's mapper
 * decides from its documented codes; the HTTP status and the transport error
 * decide what it leaves open. Returns null for a failure that says nothing
 * about the provider (a plain `Error` from our own code), which the caller
 * rethrows unchanged.
 */
export function toPublishError(
  error: unknown,
  mapProvider: ProviderErrorMapper = () => null,
  now: Date = new Date(),
): PublishError | null {
  if (isPublishError(error)) return error;

  const failure = readProviderFailure(error);
  const verdict = mapProvider(failure);
  const kind =
    verdict?.kind ??
    (failure.httpStatus === undefined
      ? kindFromTransport(failure)
      : kindFromStatus(failure.httpStatus));
  if (!kind) return null;

  const options = {
    cause: error,
    httpStatus: failure.httpStatus,
    providerCode: verdict?.providerCode,
  };
  if (kind !== PublishErrorKind.RATE_LIMITED) {
    return new PublishError(kind, messageOf(error), options);
  }
  const retryAfterMs =
    verdict?.retryAfterMs ?? readProviderRetryAfterMs(failure, now);
  return new PublishError(kind, messageOf(error), {
    ...options,
    resetAt: verdict?.resetAt,
    retryAfterMs,
  });
}

/**
 * Like `toPublishError`, for a request that may have created the post. A
 * failure that says nothing about the provider (no status, no known network
 * code) is an unknown outcome: the request may have been accepted, so it is
 * verified before any retry.
 */
export function toPublishErrorOrUnknown(
  error: unknown,
  mapProvider?: ProviderErrorMapper,
): PublishError {
  return (
    toPublishError(error, mapProvider) ??
    new PublishError(PublishErrorKind.OUTCOME_UNKNOWN, messageOf(error), {
      cause: error,
    })
  );
}

/** Throws the typed error for a provider failure, or the failure unchanged. */
export function throwAsPublishError(
  error: unknown,
  mapProvider?: ProviderErrorMapper,
): never {
  throw toPublishError(error, mapProvider) ?? error;
}
