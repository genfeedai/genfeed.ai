import type { PublishResult } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PublishErrorKind } from '@genfeedai/contracts';
import { isPublishError, PublishError } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { LoggerService } from '@libs/logger/logger.service';

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
  /** Replaces the thrown error's message, e.g. to add the reason the provider gave. */
  message?: string;
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
  'ERR_NETWORK',
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const MAYBE_SENT_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AbortError',
  // twitter-api-v2: the request failed before any response arrived.
  'ApiRequestError',
  'TimeoutError',
]);

function readStatus(error: Record<string, unknown>): number | undefined {
  const response = isRecord(error.response) ? error.response : undefined;
  const metadata = isRecord(error.metadata) ? error.metadata : undefined;
  const candidates = [
    response?.status,
    // IntegrationHttpError carries the status here.
    metadata?.status,
    error.status,
    error.statusCode,
    // twitter-api-v2 reports the HTTP status as `code`.
    typeof error.code === 'number' ? error.code : undefined,
  ];
  for (const status of candidates) {
    if (typeof status === 'number' && Number.isFinite(status)) return status;
  }
  return undefined;
}

function readNetworkCode(error: Record<string, unknown>): string | undefined {
  const sources = [
    error.code,
    isRecord(error.cause) ? error.cause.code : undefined,
    isRecord(error.requestError) ? error.requestError.code : undefined,
  ];
  return sources.find(
    (candidate): candidate is string => typeof candidate === 'string',
  );
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
    networkCode: readNetworkCode(record),
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
  const resetSeconds = readNumber(failure.headers['x-ratelimit-reset']);
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

  const message = verdict?.message ?? messageOf(error);
  const options = {
    cause: error,
    httpStatus: failure.httpStatus,
    providerCode: verdict?.providerCode,
  };
  if (kind !== PublishErrorKind.RATE_LIMITED) {
    return new PublishError(kind, message, options);
  }
  const retryAfterMs =
    verdict?.retryAfterMs ?? readProviderRetryAfterMs(failure, now);
  return new PublishError(kind, message, {
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

/** A failed result that says what the provider's refusal means. */
export function withErrorKind(
  result: PublishResult,
  errorKind: PublishErrorKind,
): PublishResult {
  return { ...result, errorKind };
}

/**
 * Logs a provider's refusal once, with what it means. A classified failure is
 * the provider's answer and is reported when it ends the post, so it is a
 * warning here carrying the kind, the provider's code and the HTTP status. A
 * failure the provider never explained is a fault and stays an error.
 */
export function logProviderPublishFailure(
  logger: Pick<LoggerService, 'error' | 'warn'>,
  message: string,
  details: { error: string; failure: PublishError | null; postId: string },
): void {
  const { failure, ...rest } = details;
  if (!failure) {
    logger.error(message, rest);
    return;
  }
  logger.warn(message, {
    ...rest,
    httpStatus: failure.httpStatus,
    kind: failure.kind,
    providerCode: failure.providerCode,
  });
}
