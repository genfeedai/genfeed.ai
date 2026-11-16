import { PublishErrorKind } from '@genfeedai/contracts';
import { isPublishError, PublishError } from '@genfeedai/contracts/interfaces';
import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import type { AxiosError } from 'axios';

interface TikTokErrorPayload {
  data?: { error?: { code?: string } };
  error?: { code?: string } | string;
  error_description?: string;
}

export function parseTikTokGrantedScopes(value: unknown): string[] {
  return parseGrantedOAuthScopes(value);
}

export function getTikTokErrorCode(error: unknown): string | undefined {
  const axiosError = error as AxiosError<TikTokErrorPayload> | null | undefined;
  const data = axiosError?.response?.data;
  const errorCode =
    (typeof data?.error === 'object' ? data.error?.code : data?.error) ??
    data?.data?.error?.code;

  return typeof errorCode === 'string' ? errorCode : undefined;
}

export function isTikTokAuthorizationError(error: unknown): boolean {
  return [
    'access_token_invalid',
    'invalid_grant',
    'invalid_refresh_token',
    'refresh_token_expired',
    'token_expired',
  ].includes(getTikTokErrorCode(error) ?? '');
}

export function isTikTokScopeError(error: unknown): boolean {
  return ['invalid_scope', 'scope_not_authorized'].includes(
    getTikTokErrorCode(error) ?? '',
  );
}

export function isTikTokRateLimitError(error: unknown): boolean {
  const axiosError = error as AxiosError<TikTokErrorPayload> | null | undefined;
  return (
    axiosError?.response?.status === 429 ||
    getTikTokErrorCode(error) === 'rate_limit_exceeded'
  );
}

export function getTikTokRetryAfterMs(
  error: unknown,
  fallbackMs: number,
  maximumMs: number,
): number {
  const axiosError = error as AxiosError<TikTokErrorPayload> | null | undefined;
  const retryAfter = axiosError?.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return fallbackMs;
  }

  return Math.min(retryAfterSeconds * 1_000, maximumMs);
}

/**
 * What a TikTok publish whose status came back `FAILED` means, from its
 * `fail_reason`. The status says the whole publish failed, so nothing was
 * published. The docs call `internal` retryable and recommend a retry for the
 * pull failures; they say "Retry should not be done" for `auth_removed`,
 * `spam_risk_user_banned_from_posting`, `spam_risk_text` and `spam_risk`.
 */
export function kindFromTikTokFailReason(
  failReason: string | undefined,
): PublishErrorKind {
  switch (failReason) {
    case 'auth_removed':
    case 'spam_risk_user_banned_from_posting':
      return PublishErrorKind.CHANNEL_DISCONNECTED;
    case 'spam_risk_too_many_posts':
      return PublishErrorKind.RATE_LIMITED;
    case 'file_format_check_failed':
    case 'duration_check_failed':
    case 'frame_rate_check_failed':
    case 'picture_size_check_failed':
    case 'spam_risk_text':
    case 'spam_risk':
    case 'publish_cancelled':
      return PublishErrorKind.CONTENT_REJECTED;
    default:
      // internal, video_pull_failed, photo_pull_failed, or a reason the docs
      // do not list.
      return PublishErrorKind.RETRY_LATER;
  }
}

/** The error for a publish whose status came back `FAILED`. */
export function tiktokPublishFailure(
  failReason: string | undefined,
): PublishError {
  return new PublishError(
    kindFromTikTokFailReason(failReason),
    `TikTok publish failed: ${failReason || 'Unknown reason'}`,
    { providerCode: failReason },
  );
}

/** Publish settings TikTok's consent rules refuse; retrying cannot change them. */
export function tiktokSettingsRejection(issues: string[]): PublishError {
  return new PublishError(PublishErrorKind.CONTENT_REJECTED, issues.join(' '));
}

/**
 * A failure while polling the status of a publish TikTok already accepted. The
 * post may exist, so the outcome is unknown unless TikTok itself said it failed.
 */
export function toPublishOutcomeUnknown(error: unknown): PublishError {
  if (isPublishError(error)) return error;
  return new PublishError(
    PublishErrorKind.OUTCOME_UNKNOWN,
    error instanceof Error ? error.message : 'TikTok status check failed',
    { cause: error },
  );
}
