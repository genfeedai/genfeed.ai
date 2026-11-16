import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { TargetExecutionState } from '@genfeedai/contracts';
import {
  createChannelTargetError,
  isAmbiguousPublishError,
  isRetryablePublishError,
} from '@workers/crons/posts/post-publish-error.util';
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
 * Whether a failed publish goes back to SCHEDULED, and what it says. A failure
 * with no error to classify is final. A rate limit waits for the provider's
 * reset and never spends the retry budget; any other retryable failure spends
 * one of `maxAttempts`. An ambiguous outcome counts as retryable so it reaches
 * the soft retry that verifies it.
 */
export function decideRetry(
  post: PostEntity,
  failure: RateLimitedFailure & { message: string },
  maxAttempts: number,
): {
  canRetry: boolean;
  errorMessage: string;
  isRetryable: boolean;
  rateLimit: RateLimitPlan | null;
} {
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
    rateLimit,
  };
}

/**
 * The write that sends a failed publish back to SCHEDULED, and the guard that
 * fences it. A rate limit keeps the retry count where it was and keeps the time
 * of the first limit on the error, so the give-up window is measured from it.
 */
export function buildRetryWrite(
  post: PostEntity,
  errorCode: string,
  errorMessage: string,
  rateLimit: RateLimitPlan | null,
  workflowExecutionId?: string,
): {
  guard: SchedulerPublishTransitionGuard | undefined;
  update: SchedulerPublishTargetUpdate;
} {
  const waiting = rateLimit?.kind === 'wait' ? rateLimit : null;
  return {
    guard: workflowExecutionId
      ? {
          expectedWorkflowExecutionId: workflowExecutionId,
          priorExecutionStates: [TargetExecutionState.PUBLISHING],
        }
      : undefined,
    update: {
      error: createChannelTargetError(
        errorCode,
        errorMessage,
        true,
        waiting?.firstLimitedAt,
      ),
      executionState: TargetExecutionState.SCHEDULED,
      lastAttemptAt: waiting?.lastAttemptAt ?? new Date(),
      retryCount: (post.retryCount || 0) + (waiting ? 0 : 1),
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
