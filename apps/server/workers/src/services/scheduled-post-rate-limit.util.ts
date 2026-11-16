import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { getPublishErrorCode } from '@workers/crons/posts/post-publish-error.util';
import {
  PUBLISH_RATE_LIMITED_CODE,
  SCHEDULED_POST_RATE_LIMIT_DEFAULT_WAIT_SECONDS,
  SCHEDULED_POST_RATE_LIMIT_GIVE_UP_SECONDS,
  SCHEDULED_POST_RATE_LIMIT_MAX_WAIT_SECONDS,
  SCHEDULED_POST_RETRY_BACKOFF_SECONDS,
} from '@workers/services/scheduled-post.constants';

/** What a rate-limited publish does next. */
export type RateLimitPlan =
  | {
      kind: 'wait';
      /** When the first rate limit of this stretch hit; kept across waits. */
      firstLimitedAt: Date;
      /**
       * Dated so the sweep, which retries a post once `lastAttemptAt` is
       * `SCHEDULED_POST_RETRY_BACKOFF_SECONDS` old, picks it up at `retryAt`.
       */
      lastAttemptAt: Date;
      retryAt: Date;
    }
  | { kind: 'give_up' };

export type RateLimitedFailure = {
  error: unknown;
  /** From a publisher that returns failures instead of throwing. */
  retryAfterMs?: number;
};

function readNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function readHeaders(error: Record<string, unknown>): Record<string, unknown> {
  const response = isRecord(error.response) ? error.response : undefined;
  const headers = response?.headers ?? error.headers;
  return isRecord(headers) ? headers : {};
}

/**
 * How long the provider said to wait, from whichever of its hints the error
 * carries: an explicit `retryAfterMs`, a `Retry-After` header (seconds or an
 * HTTP date), an `x-rate-limit-reset` header or the SDK's `rateLimit.reset`
 * (both epoch seconds). Null when it gave none.
 */
export function readRetryAfterMs(error: unknown, now: Date): number | null {
  if (!isRecord(error)) return null;

  const explicit = readNumber(error.retryAfterMs);
  if (explicit !== undefined && explicit >= 0) return explicit;

  if (error.resetAt instanceof Date) {
    return Math.max(0, error.resetAt.getTime() - now.getTime());
  }

  const headers = readHeaders(error);
  const retryAfter = headers['retry-after'];
  const seconds = readNumber(retryAfter);
  if (seconds !== undefined && seconds >= 0) return seconds * 1000;
  if (typeof retryAfter === 'string') {
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - now.getTime());
  }

  const resetEpochSeconds =
    readNumber(headers['x-rate-limit-reset']) ??
    readNumber(isRecord(error.rateLimit) ? error.rateLimit.reset : undefined);
  if (resetEpochSeconds !== undefined) {
    return Math.max(0, resetEpochSeconds * 1000 - now.getTime());
  }

  return null;
}

/**
 * The message the post carries: why it is waiting and when it tries again, or
 * why it was given up on. A failure that was not a rate limit is unchanged.
 */
export function describeRateLimitPlan(
  message: string,
  plan: RateLimitPlan | null,
): string {
  if (plan?.kind === 'wait') {
    return `${message} Next attempt at ${plan.retryAt.toISOString()}.`;
  }
  if (plan?.kind === 'give_up') {
    return `Still rate limited by the provider after ${SCHEDULED_POST_RATE_LIMIT_GIVE_UP_SECONDS / 3600} hours. ${message}`;
  }
  return message;
}

function readFirstLimitedAt(post: PostEntity): Date | null {
  const { targetError } = post as unknown as { targetError?: unknown };
  if (
    !isRecord(targetError) ||
    targetError.code !== PUBLISH_RATE_LIMITED_CODE
  ) {
    return null;
  }
  const failedAt = new Date(String(targetError.failedAt ?? ''));
  return Number.isFinite(failedAt.getTime()) ? failedAt : null;
}

/**
 * What to do with a publish the provider refused. Null when it was not a rate
 * limit. A rate limit waits for the provider's reset (or the default) and never
 * spends the retry budget; one that lasts past the give-up window fails.
 */
export function planRateLimitedRetry(
  post: PostEntity,
  failure: RateLimitedFailure,
  now: Date = new Date(),
): RateLimitPlan | null {
  const errorText = isRecord(failure.error)
    ? failure.error
    : String(failure.error ?? '');
  if (getPublishErrorCode(errorText) !== PUBLISH_RATE_LIMITED_CODE) {
    return null;
  }

  const firstLimitedAt = readFirstLimitedAt(post) ?? now;
  if (
    now.getTime() - firstLimitedAt.getTime() >=
    SCHEDULED_POST_RATE_LIMIT_GIVE_UP_SECONDS * 1000
  ) {
    return { kind: 'give_up' };
  }

  const waitMs = Math.min(
    failure.retryAfterMs ??
      readRetryAfterMs(failure.error, now) ??
      SCHEDULED_POST_RATE_LIMIT_DEFAULT_WAIT_SECONDS * 1000,
    SCHEDULED_POST_RATE_LIMIT_MAX_WAIT_SECONDS * 1000,
  );
  const retryAt = new Date(now.getTime() + waitMs);
  return {
    firstLimitedAt,
    kind: 'wait',
    lastAttemptAt: new Date(
      retryAt.getTime() - SCHEDULED_POST_RETRY_BACKOFF_SECONDS * 1000,
    ),
    retryAt,
  };
}
