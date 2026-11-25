import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import type {
  ActivityAlertOptions,
  RecordActivityInput,
} from '@api/services/activity-recording/activity-recording.types';
import type { AlertEmailNotificationPayload } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  PublishErrorKind,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  DUPLICATE_CONTENT_PROVIDER_CODE,
  type IChannelTargetError,
  PublishError,
  readPublishErrorKind,
} from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { readPostString } from '@workers/services/scheduled-post.utils';

const NON_ALPHANUMERIC_RUNS_PATTERN = /[^a-z0-9]+/g;

export type QuotaCheckResult = {
  allowed: boolean;
  currentCount: number;
  dailyLimit: number;
};

export function getPublishErrorMessage(error: unknown): string {
  return getErrorMessage(error, {
    fallback: (value) => String(value || 'Post failed'),
    messageSource: 'error-instance',
  });
}

/**
 * What a returned (not thrown) failure is classified from: its kind when the
 * publisher set one. A failure with no kind is unclassified, so it is final.
 */
export function toPublishFailureCause(result: PublishResult): unknown {
  return result.errorKind
    ? new PublishError(result.errorKind, result.error ?? '', {
        retryAfterMs: result.retryAfterMs,
      })
    : (result.error ?? '');
}

/**
 * Whether a returned failure may hide an accepted publish. A pre-publish
 * validation code is deterministic, so it never does.
 */
export function isAmbiguousPublishResult(result: PublishResult): boolean {
  return (
    !result.errorCode && isAmbiguousPublishError(toPublishFailureCause(result))
  );
}

/** The code a typed failure is stored under. */
function codeForKind(kind: PublishErrorKind): string {
  switch (kind) {
    case PublishErrorKind.RATE_LIMITED:
      return 'rate_limited';
    case PublishErrorKind.RETRY_LATER:
      return 'provider_unavailable';
    case PublishErrorKind.OUTCOME_UNKNOWN:
      return 'outcome_unknown';
    case PublishErrorKind.TOKEN_MUST_REFRESH:
      return 'token_must_refresh';
    case PublishErrorKind.CONTENT_REJECTED:
      return 'content_rejected';
    case PublishErrorKind.PROVIDER_CREDITS_DEPLETED:
      return 'provider_credits_depleted';
    case PublishErrorKind.CHANNEL_DISCONNECTED:
      return 'channel_disconnected';
  }
}

export function getPublishErrorCode(error: unknown): string {
  const kind = readPublishErrorKind(error);
  if (kind) {
    return kind === PublishErrorKind.CONTENT_REJECTED &&
      isRecord(error) &&
      error.providerCode === DUPLICATE_CONTENT_PROVIDER_CODE
      ? DUPLICATE_CONTENT_PROVIDER_CODE
      : codeForKind(kind);
  }
  const rawCode =
    isRecord(error) && 'code' in error
      ? String(error.code ?? '').toLowerCase()
      : '';
  return (
    rawCode.replace(NON_ALPHANUMERIC_RUNS_PATTERN, '_') || 'provider_error'
  );
}

/**
 * Whether a failed publish may be tried again. A typed failure says so by its
 * kind. Anything else is retried only when it says `isRetryable: true` itself,
 * never because its message or code looks like a timeout or a server error.
 */
export function isRetryablePublishError(error: unknown): boolean {
  const kind = readPublishErrorKind(error);
  if (kind) {
    return (
      kind === PublishErrorKind.RATE_LIMITED ||
      kind === PublishErrorKind.RETRY_LATER ||
      kind === PublishErrorKind.OUTCOME_UNKNOWN
    );
  }
  return (
    isRecord(error) &&
    'isRetryable' in error &&
    typeof error.isRetryable === 'boolean' &&
    error.isRetryable
  );
}

/**
 * Whether a thrown publish error leaves the provider outcome unknown: the
 * request may have reached the platform and been accepted. Only a publisher
 * can know that, so it is true for the `outcome_unknown` kind and nothing else.
 * Rate limits, refused connections and DNS failures prove nothing was published.
 */
export function isAmbiguousPublishError(error: unknown): boolean {
  return readPublishErrorKind(error) === PublishErrorKind.OUTCOME_UNKNOWN;
}

export function createChannelTargetError(
  code: string,
  message: string,
  isRetryable: boolean,
  failedAt: Date = new Date(),
): IChannelTargetError {
  return {
    code,
    failedAt: failedAt.toISOString(),
    isRetryable,
    message,
  };
}

export function createFailedPublishResult(
  platform: string,
  error?: string,
): PublishResult {
  return {
    error,
    executionState: TargetExecutionState.FAILED,
    externalId: null,
    platform,
    success: false,
    url: '',
  };
}

/** The result of a publish that went back to SCHEDULED for another attempt. */
export function createRetryScheduledResult(platform: string): PublishResult {
  return {
    executionState: TargetExecutionState.SCHEDULED,
    externalId: null,
    platform,
    success: false,
    url: '',
  };
}

const ALERT_POST_LABEL_LENGTH = 80;
const ALERT_REASON_LENGTH = 300;

function describePostForAlert(post: PostEntity): string {
  const text = htmlToText(post.description ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return 'Scheduled post';
  }
  return text.length > ALERT_POST_LABEL_LENGTH
    ? `${text.slice(0, ALERT_POST_LABEL_LENGTH - 1)}…`
    : text;
}

/** What the failure email says: the post, the channel and why it failed. */
function buildPublishFailedAlert(
  post: PostEntity,
  reason: string,
): ActivityAlertOptions {
  const platform = readPostString(post, ['platform']) ?? 'its channel';
  const payload: AlertEmailNotificationPayload = {
    event: 'post_failed',
    kind: 'alert_email',
    label: describePostForAlert(post),
    summary: `It was not published to ${platform}: ${reason.slice(0, ALERT_REASON_LENGTH)}`,
    version: 1,
  };
  return { payload };
}

export function createQuotaExceededActivity(
  post: PostEntity,
  quotaCheck: QuotaCheckResult,
  platform: string,
): RecordActivityInput {
  const value = `Quota exceeded: ${quotaCheck.currentCount}/${quotaCheck.dailyLimit} posts for ${platform}`;
  return {
    alert: buildPublishFailedAlert(post, value),
    brandId: readPostString(post, ['brandId']) ?? null,
    entityId: post.id,
    entityModel: ActivityEntityModel.POST,
    key: ActivityKey.POST_FAILED,
    organizationId: readPostString(post, ['organizationId']) ?? null,
    source: ActivitySource.POST,
    userId: readPostString(post, ['userId']) ?? null,
    value,
  };
}

export function createPublishFailedActivity(
  post: PostEntity,
  errorMessage: string,
): RecordActivityInput {
  return {
    alert: buildPublishFailedAlert(post, errorMessage),
    brandId: readPostString(post, ['brandId']) ?? null,
    entityId: post.id,
    entityModel: ActivityEntityModel.POST,
    key: ActivityKey.POST_FAILED,
    organizationId: readPostString(post, ['organizationId']) ?? null,
    source: ActivitySource.POST,
    userId: readPostString(post, ['userId']) ?? null,
    value: errorMessage,
  };
}

/**
 * The owner is told once per publish attempt that the provider never confirmed
 * whether the post went out. The key is the post and the attempt's start, so
 * the hourly re-verification that follows records nothing new.
 */
export function createPublishUnverifiedActivity(
  post: PostEntity,
  attemptStartedAt: Date,
): RecordActivityInput {
  const platform = readPostString(post, ['platform']) ?? 'its channel';
  const summary = `We could not confirm whether this post went out to ${platform}. It may already be live. Check your ${platform} account before posting it again.`;
  const payload: AlertEmailNotificationPayload = {
    event: 'publish_unverified',
    kind: 'alert_email',
    label: describePostForAlert(post),
    summary,
    version: 1,
  };
  return {
    alert: {
      deduplicationKey: `${ActivityKey.POST_PUBLISH_UNVERIFIED}/${post.id}/${attemptStartedAt.getTime()}`,
      payload,
    },
    brandId: readPostString(post, ['brandId']) ?? null,
    entityId: post.id,
    entityModel: ActivityEntityModel.POST,
    key: ActivityKey.POST_PUBLISH_UNVERIFIED,
    organizationId: readPostString(post, ['organizationId']) ?? null,
    source: ActivitySource.POST,
    userId: readPostString(post, ['userId']) ?? null,
    value: summary,
  };
}

/**
 * Whether a failure is a classified provider outcome: the publisher read the
 * provider's answer and said what it means. Such a failure is reported once, in
 * its terminal state, so the layers it passes through log it as a warning.
 */
export function isClassifiedPublishFailure(error: unknown): boolean {
  return readPublishErrorKind(error) !== null;
}

/**
 * Whether a terminal failure is something the owner fixes by editing the post.
 * It is told by the failure alert and is not an alert for the team.
 */
export function isOwnerActionablePublishCode(errorCode: string): boolean {
  return errorCode === DUPLICATE_CONTENT_PROVIDER_CODE;
}
