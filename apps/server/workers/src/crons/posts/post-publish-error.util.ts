import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IChannelTargetError } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { readPostString } from '@workers/services/scheduled-post.utils';

const RETRYABLE_ERROR_PATTERNS = [
  'rate limit',
  'rate_limited',
  'transient_failure',
  'timeout',
  'timed out',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'socket hang up',
  '429',
  '500',
  '502',
  '503',
  '504',
] as const;

export type QuotaCheckResult = {
  allowed: boolean;
  currentCount: number;
  dailyLimit: number;
};

export type QueuedPostPublishSkip = {
  reason: 'not_eligible';
  skipped: true;
};

export function getPublishErrorMessage(error: unknown): string {
  return getErrorMessage(error, {
    fallback: (value) => String(value || 'Post failed'),
    messageSource: 'error-instance',
  });
}

export function getPublishErrorCode(error: unknown): string {
  const message = getPublishErrorMessage(error).toLowerCase();
  const rawCode =
    isRecord(error) && 'code' in error
      ? String(error.code ?? '').toLowerCase()
      : '';
  const classificationText = `${rawCode} ${message}`;
  if (
    classificationText.includes('rate limit') ||
    classificationText.includes('429')
  ) {
    return 'rate_limited';
  }
  if (
    classificationText.includes('timeout') ||
    classificationText.includes('timed out') ||
    classificationText.includes('etimedout')
  ) {
    return 'timeout';
  }
  if (/\b(500|502|503|504)\b/.test(classificationText)) {
    return 'provider_unavailable';
  }
  return rawCode.replace(/[^a-z0-9]+/g, '_') || 'provider_error';
}

export function isRetryablePublishError(error: unknown): boolean {
  if (
    isRecord(error) &&
    'isRetryable' in error &&
    typeof error.isRetryable === 'boolean'
  ) {
    return error.isRetryable;
  }

  const errorMessage = getPublishErrorMessage(error).toLowerCase();
  const errorCode =
    isRecord(error) && 'code' in error ? String(error.code ?? '') : '';
  const normalizedErrorCode = errorCode.toLowerCase();

  return RETRYABLE_ERROR_PATTERNS.some(
    (pattern) =>
      errorMessage.includes(pattern.toLowerCase()) ||
      normalizedErrorCode.includes(pattern.toLowerCase()),
  );
}

const AMBIGUOUS_OUTCOME_PATTERNS = [
  'econnreset',
  'socket hang up',
  'epipe',
] as const;

function readHttpStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const response = isRecord(error.response) ? error.response : null;
  const status = error.statusCode ?? error.status ?? response?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * Whether a thrown publish error leaves the provider outcome unknown: the
 * request may have reached the platform and been accepted (timeouts, dropped
 * connections, 5xx, provider-normalized transient failures). Rate limits,
 * refused connections and DNS failures prove nothing was published.
 */
export function isAmbiguousPublishError(error: unknown): boolean {
  const status = readHttpStatus(error);
  if (status !== null && status >= 500) return true;
  const code = getPublishErrorCode(error);
  if (
    code === 'timeout' ||
    code === 'provider_unavailable' ||
    code === 'transient_failure'
  )
    return true;
  const message = getPublishErrorMessage(error).toLowerCase();
  const rawCode =
    isRecord(error) && 'code' in error
      ? String(error.code ?? '').toLowerCase()
      : '';
  return AMBIGUOUS_OUTCOME_PATTERNS.some(
    (pattern) => message.includes(pattern) || rawCode.includes(pattern),
  );
}

export function createChannelTargetError(
  code: string,
  message: string,
  isRetryable: boolean,
): IChannelTargetError {
  return {
    code,
    failedAt: new Date().toISOString(),
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

export function createQuotaExceededActivity(
  post: PostEntity,
  quotaCheck: QuotaCheckResult,
  platform: string,
): RecordActivityInput {
  return {
    brandId: readPostString(post, ['brandId']) ?? null,
    entityId: post.id,
    entityModel: ActivityEntityModel.POST,
    key: ActivityKey.POST_FAILED,
    organizationId: readPostString(post, ['organizationId']) ?? null,
    source: ActivitySource.POST,
    userId: readPostString(post, ['userId']) ?? null,
    value: `Quota exceeded: ${quotaCheck.currentCount}/${quotaCheck.dailyLimit} posts for ${platform}`,
  };
}

export function createPublishFailedActivity(
  post: PostEntity,
  errorMessage: string,
): RecordActivityInput {
  return {
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
