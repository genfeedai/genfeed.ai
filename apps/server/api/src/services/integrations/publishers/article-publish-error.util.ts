import { PublishErrorKind } from '@genfeedai/contracts';
import { isPublishError, PublishError } from '@genfeedai/contracts/interfaces';
import { isObjectLike } from '@genfeedai/utils/data/extract.util';

/**
 * Network failures where the request never reached the provider: the name did
 * not resolve or the connection was refused. Nothing can have been published.
 */
const REQUEST_NEVER_SENT_CODES: ReadonlySet<string> = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENOTFOUND',
]);

export interface ArticlePublishErrorOptions {
  /** Provider name used in the message, e.g. `Ghost`. */
  provider: string;
  /**
   * Whether a 401 can be fixed by refreshing the access token. API-key
   * providers and non-expiring tokens cannot, so a 401 there means the owner
   * must reconnect.
   */
  isTokenRefreshable?: boolean;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readStatus(error: unknown): number | undefined {
  if (!isObjectLike(error)) return undefined;
  const response = isObjectLike(error.response) ? error.response : undefined;
  return (
    readNumber(response?.status) ??
    readNumber(error.statusCode) ??
    readNumber(error.status)
  );
}

function readHeader(error: unknown, name: string): string | undefined {
  if (!isObjectLike(error)) return undefined;
  const response = isObjectLike(error.response) ? error.response : undefined;
  const headers = response?.headers;
  if (!isObjectLike(headers)) return undefined;
  const value =
    typeof headers.get === 'function'
      ? (headers.get as (key: string) => unknown).call(headers, name)
      : headers[name];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * How long the provider said to wait, from the standard `Retry-After` header:
 * either a number of seconds or an HTTP date (RFC 9110 section 10.2.3).
 */
export function readRetryAfterMs(
  error: unknown,
  now: Date = new Date(),
): number | undefined {
  const header = readHeader(error, 'retry-after');
  if (!header) return undefined;
  const seconds = readNumber(header);
  if (seconds !== undefined) return seconds >= 0 ? seconds * 1000 : undefined;
  const date = new Date(header).getTime();
  return Number.isNaN(date) ? undefined : Math.max(0, date - now.getTime());
}

function describe(error: unknown, fallback: string): string {
  if (isObjectLike(error) && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

/**
 * The typed failure for a request that failed while creating an article, post
 * or product. The kind comes from the HTTP status and the network error code,
 * never from message text. A failure that proves nothing was published is
 * `retry_later` or `rate_limited`; anything that may have reached the provider
 * (timeout, dropped connection, 5xx, an error thrown after the request left)
 * is `outcome_unknown`, so the worker verifies before it retries.
 */
export function toArticlePublishError(
  error: unknown,
  options: ArticlePublishErrorOptions,
): PublishError {
  if (isPublishError(error)) return error;

  const { provider } = options;
  const status = readStatus(error);
  const networkCode =
    isObjectLike(error) && typeof error.code === 'string'
      ? error.code
      : undefined;
  const reason = describe(error, `${provider} request failed`);
  const details = {
    cause: error,
    httpStatus: status,
    providerCode: networkCode,
  };

  if (status === undefined) {
    if (networkCode && REQUEST_NEVER_SENT_CODES.has(networkCode)) {
      return new PublishError(
        PublishErrorKind.RETRY_LATER,
        `${provider} could not be reached: ${reason}`,
        details,
      );
    }
    return new PublishError(
      PublishErrorKind.OUTCOME_UNKNOWN,
      `${provider} did not confirm the publish: ${reason}`,
      details,
    );
  }

  if (status === 429) {
    return new PublishError(
      PublishErrorKind.RATE_LIMITED,
      `${provider} rate limited the request`,
      { ...details, retryAfterMs: readRetryAfterMs(error) },
    );
  }

  if (status === 408 || status >= 500) {
    return new PublishError(
      PublishErrorKind.OUTCOME_UNKNOWN,
      `${provider} answered ${status} and may have accepted the publish`,
      details,
    );
  }

  if (status === 401 && options.isTokenRefreshable) {
    return new PublishError(
      PublishErrorKind.TOKEN_MUST_REFRESH,
      `${provider} rejected the access token`,
      details,
    );
  }

  // 401 and 403 mean the credential or account was refused, 402 and 423 that
  // the account is frozen or locked, and 404 that the site, publication or
  // user the credential points at is gone. The owner has to fix the account.
  if (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 404 ||
    status === 423
  ) {
    return new PublishError(
      PublishErrorKind.CHANNEL_DISCONNECTED,
      `${provider} refused the connected account (${status})`,
      details,
    );
  }

  return new PublishError(
    PublishErrorKind.CONTENT_REJECTED,
    `${provider} rejected the content (${status}): ${reason}`,
    details,
  );
}
