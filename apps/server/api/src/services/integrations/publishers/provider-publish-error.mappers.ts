import {
  type ProviderErrorVerdict,
  type ProviderFailure,
} from '@api/services/integrations/publishers/publish-error.util';
import { getTikTokErrorCode } from '@api/services/integrations/tiktok/utils/tiktok-error.util';
import { PublishErrorKind } from '@genfeedai/contracts';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { HttpException } from '@nestjs/common';

/**
 * Each mapper reads the provider's documented error codes. Anything it does not
 * list falls to the HTTP status in `toPublishError`, so a code missing here
 * never decides anything on its own. Sources, read 2026-11-16:
 * - YouTube: developers.google.com/youtube/v3/docs/videos/insert, /docs/errors
 *   and /determine_quota_cost
 * - TikTok: developers.tiktok.com content-posting-api-reference-direct-post,
 *   -photo-post, -upload-video, -get-video-status and tiktok-api-v2-error-handling
 * - Snapchat: developers.snap.com/marketing-api/Ads-API/rate-limits documents a
 *   429 and no error codes or headers, so Snapchat maps by status alone
 * - Pinterest: its error codes could not be read, so Pinterest maps by status
 *   alone
 */

const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

/** Offset of Pacific Time from UTC at `instant`, in milliseconds. */
function pacificOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    minute: 'numeric',
    month: 'numeric',
    second: 'numeric',
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(instant);
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const localAsUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );
  return localAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The next midnight Pacific Time, when YouTube's daily quota resets. */
export function nextPacificMidnight(now: Date): Date {
  const localNow = new Date(now.getTime() + pacificOffsetMs(now));
  const localNextMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + 1,
  );
  // Read the offset at the midnight itself: it differs from the offset now on a
  // night the clocks change.
  const firstGuess = new Date(localNextMidnight - pacificOffsetMs(now));
  return new Date(localNextMidnight - pacificOffsetMs(firstGuess));
}

function readYoutubeReason(cause: unknown): string | undefined {
  if (!isRecord(cause)) return undefined;
  const response = isRecord(cause.response) ? cause.response : undefined;
  const data = isRecord(response?.data) ? response.data : undefined;
  const body = isRecord(data?.error) ? data.error : undefined;
  for (const list of [cause.errors, body?.errors]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (isRecord(entry) && typeof entry.reason === 'string') {
        return entry.reason;
      }
    }
  }
  return undefined;
}

export function mapYoutubeFailure(
  failure: ProviderFailure,
  now: Date = new Date(),
): ProviderErrorVerdict | null {
  // The auth service marks the credential disconnected and throws this 401
  // HttpException when Google answers `invalid_grant`: the grant is revoked.
  if (failure.cause instanceof HttpException && failure.httpStatus === 401) {
    return { kind: PublishErrorKind.CHANNEL_DISCONNECTED };
  }

  const providerCode = readYoutubeReason(failure.cause);
  switch (providerCode) {
    case 'quotaExceeded':
      // The docs: "Daily quotas reset at midnight Pacific Time (PT)."
      return {
        kind: PublishErrorKind.RATE_LIMITED,
        providerCode,
        resetAt: nextPacificMidnight(now),
      };
    case 'uploadLimitExceeded':
      // The docs give no reset time for the upload limit.
      return { kind: PublishErrorKind.RATE_LIMITED, providerCode };
    case 'forbidden':
    case 'insufficientPermissions':
    case 'youtubeSignupRequired':
      return { kind: PublishErrorKind.CHANNEL_DISCONNECTED, providerCode };
    case 'forbiddenLicenseSetting':
    case 'forbiddenPrivacySetting':
      return { kind: PublishErrorKind.CONTENT_REJECTED, providerCode };
    default:
      return providerCode ? { providerCode } : null;
  }
}

/** TikTok `error.code` values the docs list, by what the pipeline should do. */
function kindFromTikTokCode(code: string): PublishErrorKind | null {
  switch (code) {
    case 'access_token_invalid':
      return PublishErrorKind.TOKEN_MUST_REFRESH;
    case 'scope_not_authorized':
    case 'scope_permission_missed':
    case 'spam_risk_user_banned_from_posting':
      return PublishErrorKind.CHANNEL_DISCONNECTED;
    case 'rate_limit_exceeded':
    case 'spam_risk_too_many_posts':
    case 'spam_risk_too_many_pending_share':
    case 'reached_active_user_cap':
      return PublishErrorKind.RATE_LIMITED;
    case 'unaudited_client_can_only_post_to_private_accounts':
    case 'url_ownership_unverified':
    case 'privacy_level_option_mismatch':
    case 'invalid_file_upload':
    case 'invalid_param':
    case 'invalid_params':
    case 'app_version_check_failed':
      return PublishErrorKind.CONTENT_REJECTED;
    case 'internal_error':
      // TikTok's own fault on a publish call: it may have accepted the post.
      return PublishErrorKind.OUTCOME_UNKNOWN;
    default:
      return null;
  }
}

export function mapTikTokFailure(
  failure: ProviderFailure,
): ProviderErrorVerdict | null {
  const providerCode = getTikTokErrorCode(failure.cause);
  if (!providerCode) return null;
  const kind = kindFromTikTokCode(providerCode);
  return kind ? { kind, providerCode } : { providerCode };
}

const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_SERVER_ERROR = 500;

/**
 * For a request that creates nothing on the provider, such as a token refresh
 * or a media upload. A timeout, server fault or dropped connection there proves
 * no post exists, so it is `retry_later` and not `outcome_unknown`.
 */
export function mapUnpublishedRequestFailure(
  failure: ProviderFailure,
): ProviderErrorVerdict | null {
  const status = failure.httpStatus;
  return status === undefined ||
    status === HTTP_REQUEST_TIMEOUT ||
    status >= HTTP_SERVER_ERROR
    ? { kind: PublishErrorKind.RETRY_LATER }
    : null;
}
