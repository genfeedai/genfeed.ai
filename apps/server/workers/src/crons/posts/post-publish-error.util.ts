import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IChannelTargetError } from '@genfeedai/contracts/interfaces';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { readPostString } from '@workers/services/scheduled-post.utils';

const RETRYABLE_ERROR_PATTERNS = [
  'rate limit',
  'rate_limited',
  'transient_failure',
  'timeout',
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

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

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
): ActivityEntity {
  return new ActivityEntity({
    brandId: readPostString(post, ['brandId']) ?? undefined,
    entityId: post.id,
    entityModel: ActivityEntityModel.POST,
    key: ActivityKey.POST_FAILED,
    organizationId: readPostString(post, ['organizationId']) ?? undefined,
    source: ActivitySource.POST,
    userId: readPostString(post, ['userId']) ?? undefined,
    value: `Quota exceeded: ${quotaCheck.currentCount}/${quotaCheck.dailyLimit} posts for ${platform}`,
  });
}

export function createPublishFailedActivity(
  post: PostEntity,
  errorMessage: string,
): ActivityEntity {
  return new ActivityEntity({
    brandId: readPostString(post, ['brandId']) ?? undefined,
    entityId: post.id,
    entityModel: ActivityEntityModel.POST,
    key: ActivityKey.POST_FAILED,
    organizationId: readPostString(post, ['organizationId']) ?? undefined,
    source: ActivitySource.POST,
    userId: readPostString(post, ['userId']) ?? undefined,
    value: errorMessage,
  });
}
