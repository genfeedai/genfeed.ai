import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { TargetExecutionState } from '@genfeedai/contracts';
import {
  createChannelTargetError,
  isAmbiguousPublishError,
  isRetryablePublishError,
} from '@workers/crons/posts/post-publish-error.util';
import {
  PUBLISH_TOKEN_REFRESHED_CODE,
  SCHEDULED_POST_RETRY_BACKOFF_SECONDS,
} from '@workers/services/scheduled-post.constants';
import {
  describeRateLimitPlan,
  planRateLimitedRetry,
  type RateLimitedFailure,
  type RateLimitPlan,
} from '@workers/services/scheduled-post-rate-limit.util';
import type {
  SchedulerPublishTargetUpdate,
  SchedulerPublishTransitionGuard,
} from '@workers/services/scheduler-publish-state.service';

/**
 * What a retry does beyond going back to SCHEDULED: wait out a rate limit, or
 * run again at once after the token was refreshed. Neither spends the retry
 * budget.
 */
export type RetryPlan = RateLimitPlan | { kind: 'refreshed' };

/**
 * Whether a failed publish goes back to SCHEDULED, and what it says. A failure
 * with no error to classify is final. A rate limit waits for the provider's
 * reset and never spends the retry budget; any other retryable failure spends
 * one of `maxAttempts`. An ambiguous outcome counts as retryable so it reaches
 * the soft retry that verifies it. A refreshed token retries at once and, like
 * a rate limit, spends nothing.
 */
export function decideRetry(
  post: PostEntity,
  failure: RateLimitedFailure & { message: string },
  maxAttempts: number,
  recovery: RetryPlan | null = null,
): {
  canRetry: boolean;
  errorMessage: string;
  isRetryable: boolean;
  plan: RetryPlan | null;
} {
  if (recovery?.kind === 'refreshed') {
    return {
      canRetry: true,
      errorMessage: failure.message,
      isRetryable: true,
      plan: recovery,
    };
  }
  const rateLimit = planRateLimitedRetry(post, failure);
  const isRetryable =
    failure.error !== undefined &&
    (isRetryablePublishError(failure.error) ||
      isAmbiguousPublishError(failure.error));
  return {
    canRetry: rateLimit
      ? rateLimit.kind === 'wait'
      : isRetryable && (post.retryCount || 0) < maxAttempts,
    errorMessage: describeRateLimitPlan(failure.message, rateLimit),
    isRetryable,
    plan: rateLimit,
  };
}

/**
 * The write that sends a failed publish back to SCHEDULED, and the guard that
 * fences it. A rate limit keeps the retry count where it was and keeps the time
 * of the first limit on the error, so the give-up window is measured from it.
 * A refreshed token does the same and is due on the next sweep.
 */
export function buildRetryWrite(
  post: PostEntity,
  errorCode: string,
  errorMessage: string,
  plan: RetryPlan | null,
  workflowExecutionId?: string,
): {
  guard: SchedulerPublishTransitionGuard | undefined;
  update: SchedulerPublishTargetUpdate;
} {
  const waiting = plan?.kind === 'wait' ? plan : null;
  const isRefreshed = plan?.kind === 'refreshed';
  return {
    guard: workflowExecutionId
      ? {
          expectedWorkflowExecutionId: workflowExecutionId,
          priorExecutionStates: [TargetExecutionState.PUBLISHING],
        }
      : undefined,
    update: {
      error: createChannelTargetError(
        isRefreshed ? PUBLISH_TOKEN_REFRESHED_CODE : errorCode,
        errorMessage,
        true,
        waiting?.firstLimitedAt,
      ),
      executionState: TargetExecutionState.SCHEDULED,
      lastAttemptAt: isRefreshed
        ? new Date(Date.now() - SCHEDULED_POST_RETRY_BACKOFF_SECONDS * 1000)
        : (waiting?.lastAttemptAt ?? new Date()),
      retryCount: (post.retryCount || 0) + (waiting || isRefreshed ? 0 : 1),
      ...(workflowExecutionId ? { workflowExecutionId } : {}),
    },
  };
}

/** The write that ends a publish FAILED, and the guard that fences it. */
export function buildFailureWrite(
  errorCode: string,
  errorMessage: string,
  workflowExecutionId?: string,
  failureGuard?: SchedulerPublishTransitionGuard,
): {
  guard: SchedulerPublishTransitionGuard | undefined;
  update: SchedulerPublishTargetUpdate;
} {
  return {
    guard:
      workflowExecutionId || failureGuard
        ? {
            ...(workflowExecutionId
              ? {
                  expectedWorkflowExecutionId: workflowExecutionId,
                  priorExecutionStates: [TargetExecutionState.PUBLISHING],
                }
              : {}),
            ...failureGuard,
          }
        : undefined,
    update: {
      error: createChannelTargetError(errorCode, errorMessage, false),
      executionState: TargetExecutionState.FAILED,
      lastAttemptAt: new Date(),
      ...(workflowExecutionId ? { workflowExecutionId } : {}),
    },
  };
}
