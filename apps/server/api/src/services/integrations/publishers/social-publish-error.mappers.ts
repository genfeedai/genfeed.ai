import {
  type ProviderErrorVerdict,
  type ProviderFailure,
} from '@api/services/integrations/publishers/publish-error.util';
import {
  describeTwitterPublishError,
  isTwitterCreditsDepletedError,
} from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import { PublishErrorKind } from '@genfeedai/contracts';
import { isRecord } from '@genfeedai/utils/data/extract.util';

/**
 * Each mapper reads the provider's documented error codes and returns a kind
 * for the ones it knows. A code it does not list leaves the kind to the HTTP
 * status in `toPublishError`. Sources, read 2026-11-16:
 * - Meta (Facebook, Instagram, Threads): developers.facebook.com Graph API
 *   error handling and rate limiting guides, and the Instagram Platform error
 *   codes reference
 * - X: docs.x.com response codes and errors
 * - Mastodon: docs.joinmastodon.org rate limits and statuses methods
 * - LinkedIn: learn.microsoft.com LinkedIn API error handling
 * Not documented and so not mapped: the error code Threads returns for an
 * exhausted publishing quota.
 */

function readBody(failure: ProviderFailure): Record<string, unknown> {
  const { cause } = failure;
  if (!isRecord(cause)) return {};
  const response = isRecord(cause.response) ? cause.response : undefined;
  const body = response?.data ?? cause.data;
  return isRecord(body) ? body : {};
}

function readInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined;
}

function readBaseMessage(failure: ProviderFailure): string | undefined {
  return failure.cause instanceof Error ? failure.cause.message : undefined;
}

/** The thrown message with the reason the provider gave, when it is not in it. */
function withProviderReason(
  failure: ProviderFailure,
  reason: unknown,
): string | undefined {
  const base = readBaseMessage(failure);
  if (typeof reason !== 'string' || !reason || !base) return undefined;
  return base.includes(reason) ? undefined : `${base} - ${reason}`;
}

/** 463 and 467: the token expired or is invalid, and a refresh can fix it. */
const META_TOKEN_MUST_REFRESH_SUBCODES: ReadonlySet<number> = new Set([
  463, 467,
]);
/** 458 app not installed, 459 and 464 checkpointed, 460 password changed, 492 no Page role. */
const META_RECONNECT_SUBCODES: ReadonlySet<number> = new Set([
  458, 459, 460, 464, 492,
]);
/** 4, 17 and 32 throttling, 341 app limit, 613 custom limit. */
const META_RATE_LIMIT_CODES: ReadonlySet<number> = new Set([
  4, 17, 32, 341, 613,
]);
/** Business use case limits, codes 80000 to 80014. */
const META_BUSINESS_LIMIT_CODES = { max: 80014, min: 80000 } as const;
/** 1 and 2 are Meta outages; -1 and -2 are Instagram server errors and download timeouts. */
const META_SERVER_FAULT_CODES: ReadonlySet<number> = new Set([-2, -1, 1, 2]);
/** 10, and 200 to 299: the permission is not granted or was removed. */
const META_PERMISSION_CODES = { max: 299, min: 200 } as const;
/** 100 invalid parameter, 506 duplicate post, 1609005 link could not be scraped. */
const META_CONTENT_REJECTED_CODES: ReadonlySet<number> = new Set([
  100, 506, 1609005,
]);

/**
 * 100 with subcode 33: "Object with ID ... does not exist, cannot be loaded
 * due to missing permissions". On a publish call the object is the account
 * itself, so the token no longer reaches it (grant removed, asset unassigned,
 * account moved). Retrying cannot work; the owner must reconnect.
 */
const META_OBJECT_UNREACHABLE_SUBCODE = 33;

const INSTAGRAM_DAILY_LIMIT_SUBCODE = 2207042;
const INSTAGRAM_ACCOUNT_RESTRICTED_SUBCODE = 2207050;
const INSTAGRAM_SPAM_RESTRICTION_SUBCODE = 2207051;
/** The container expired or is not ready: nothing was published, make a fresh one. */
const INSTAGRAM_CONTAINER_NOT_PUBLISHABLE_SUBCODES: ReadonlySet<number> =
  new Set([2207008, 2207020, 2207027]);

function classifyGraphError(
  code: number | undefined,
  subcode: number | undefined,
  isTransient: boolean,
): PublishErrorKind | undefined {
  // Instagram subcodes first: they mean something other than the code they
  // ride on (2207051 comes with the throttling code 4).
  if (subcode === INSTAGRAM_DAILY_LIMIT_SUBCODE) {
    return PublishErrorKind.RATE_LIMITED;
  }
  if (subcode === INSTAGRAM_SPAM_RESTRICTION_SUBCODE) {
    return PublishErrorKind.CONTENT_REJECTED;
  }
  if (subcode === INSTAGRAM_ACCOUNT_RESTRICTED_SUBCODE) {
    return PublishErrorKind.CHANNEL_DISCONNECTED;
  }
  if (
    subcode !== undefined &&
    INSTAGRAM_CONTAINER_NOT_PUBLISHABLE_SUBCODES.has(subcode)
  ) {
    return PublishErrorKind.RETRY_LATER;
  }
  if (code === undefined) return undefined;

  // Before the generic 100 (invalid parameter): this one is not about content.
  if (code === 100 && subcode === META_OBJECT_UNREACHABLE_SUBCODE) {
    return PublishErrorKind.CHANNEL_DISCONNECTED;
  }

  if (code === 190 || code === 102) {
    if (subcode !== undefined && META_RECONNECT_SUBCODES.has(subcode)) {
      return PublishErrorKind.CHANNEL_DISCONNECTED;
    }
    return subcode === undefined ||
      META_TOKEN_MUST_REFRESH_SUBCODES.has(subcode)
      ? PublishErrorKind.TOKEN_MUST_REFRESH
      : undefined;
  }
  if (
    code === 10 ||
    (code >= META_PERMISSION_CODES.min && code <= META_PERMISSION_CODES.max)
  ) {
    return PublishErrorKind.CHANNEL_DISCONNECTED;
  }
  if (
    META_RATE_LIMIT_CODES.has(code) ||
    (code >= META_BUSINESS_LIMIT_CODES.min &&
      code <= META_BUSINESS_LIMIT_CODES.max)
  ) {
    return PublishErrorKind.RATE_LIMITED;
  }
  if (code === 368) return PublishErrorKind.RETRY_LATER;
  if (META_SERVER_FAULT_CODES.has(code))
    return PublishErrorKind.OUTCOME_UNKNOWN;
  if (META_CONTENT_REJECTED_CODES.has(code)) {
    return PublishErrorKind.CONTENT_REJECTED;
  }
  return isTransient ? PublishErrorKind.OUTCOME_UNKNOWN : undefined;
}

/**
 * How long Meta said to wait: the longest `estimated_time_to_regain_access`
 * (minutes) in `X-Business-Use-Case`. Without it, the generic `Retry-After`
 * reading applies.
 */
function readMetaRetryAfterMs(failure: ProviderFailure): number | undefined {
  const usage = failure.headers['x-business-use-case'];
  let longestMinutes = 0;
  try {
    const parsed: unknown =
      typeof usage === 'string' ? JSON.parse(usage) : usage;
    if (isRecord(parsed)) {
      for (const entries of Object.values(parsed)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const minutes = isRecord(entry)
            ? entry.estimated_time_to_regain_access
            : undefined;
          if (typeof minutes === 'number' && minutes > longestMinutes) {
            longestMinutes = minutes;
          }
        }
      }
    }
  } catch {
    // An unreadable header is the same as none.
  }
  return longestMinutes > 0 ? longestMinutes * 60_000 : undefined;
}

/** Facebook, Instagram and Threads publish through the same Graph error format. */
export function mapMetaFailure(
  failure: ProviderFailure,
): ProviderErrorVerdict | null {
  if (failure.httpStatus === undefined) return null;
  const graphError = readBody(failure).error;
  const body = isRecord(graphError) ? graphError : {};
  const code = readInteger(body.code);
  return {
    kind: classifyGraphError(
      code,
      readInteger(body.error_subcode),
      body.is_transient === true,
    ),
    message: withProviderReason(failure, body.message),
    providerCode: code === undefined ? undefined : String(code),
    retryAfterMs: readMetaRetryAfterMs(failure),
  };
}

/** X problem types from its response codes guide. */
const X_USAGE_CAPPED_TYPE_SUFFIX = '/usage-capped';
const X_RECONNECT_TYPE_SUFFIXES = [
  '/client-forbidden',
  '/not-authorized-for-resource',
] as const;

function readXResetAt(failure: ProviderFailure): Date | undefined {
  const { cause } = failure;
  const rateLimit =
    isRecord(cause) && isRecord(cause.rateLimit) ? cause.rateLimit : undefined;
  // Both are epoch seconds.
  const raw = rateLimit?.reset ?? failure.headers['x-rate-limit-reset'];
  const seconds = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds))
    return undefined;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/** X reports the HTTP status as `code` and the problem as `data`. */
export function mapXFailure(
  failure: ProviderFailure,
  now: Date = new Date(),
): ProviderErrorVerdict | null {
  const { cause, httpStatus } = failure;
  if (httpStatus === undefined) return null;
  const type = String(readBody(failure).type ?? '');
  const message = describeTwitterPublishError(cause);

  if (httpStatus === 402 || isTwitterCreditsDepletedError(cause)) {
    // The Genfeed X app is out of credits. Nothing was published and adding
    // credits fixes it, so the post is tried again later.
    return { kind: PublishErrorKind.RETRY_LATER, message };
  }
  if (httpStatus === 429) {
    // A usage cap lasts until the billing period turns, not until a reset
    // header, so it is not a rate limit to wait out.
    if (type.endsWith(X_USAGE_CAPPED_TYPE_SUFFIX)) {
      return { kind: PublishErrorKind.RETRY_LATER, message };
    }
    const resetAt = readXResetAt(failure);
    return {
      message,
      resetAt,
      retryAfterMs: resetAt
        ? Math.max(0, resetAt.getTime() - now.getTime())
        : undefined,
    };
  }
  if (httpStatus === 403) {
    return {
      kind: X_RECONNECT_TYPE_SUFFIXES.some((suffix) => type.endsWith(suffix))
        ? PublishErrorKind.CHANNEL_DISCONNECTED
        : PublishErrorKind.CONTENT_REJECTED,
      message,
    };
  }
  return { message };
}

/**
 * Mastodon documents 401 (invalid token), 422 (validation failed) and 429 with
 * `X-RateLimit-Reset` as a timestamp. A Mastodon token never expires and has
 * no refresh, so a 401 or 403 means the owner has to reconnect.
 */
export function mapMastodonFailure(
  failure: ProviderFailure,
): ProviderErrorVerdict | null {
  if (failure.httpStatus === undefined) return null;
  const resetAt = new Date(String(failure.headers['x-ratelimit-reset']));
  return {
    kind:
      failure.httpStatus === 401
        ? PublishErrorKind.CHANNEL_DISCONNECTED
        : undefined,
    message: withProviderReason(failure, readBody(failure).error),
    resetAt: Number.isFinite(resetAt.getTime()) ? resetAt : undefined,
  };
}
