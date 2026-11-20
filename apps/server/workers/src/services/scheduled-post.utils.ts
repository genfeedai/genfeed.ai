import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { resolvePostVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import {
  PUBLISH_OUTCOME_UNCONFIRMED_CODE,
  PUBLISH_OUTCOME_UNVERIFIED_CODE,
  SCHEDULED_POST_UNVERIFIED_BACKOFF_SECONDS,
  SCHEDULED_POST_VERIFICATION_BACKOFF_SECONDS,
  SCHEDULED_POST_VERIFICATION_WINDOW_SECONDS,
} from '@workers/services/scheduled-post.constants';

export function readPostString(
  post: PostEntity,
  keys: readonly string[],
): string | undefined {
  const record = post as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }
  }

  return undefined;
}

type UnverifiedDeferral = {
  backoffSeconds: number;
  code: string;
  isWindowExpired: boolean;
  message: string;
};

/**
 * How an occurrence whose provider outcome is unknown is deferred: short
 * verification backoff inside the window, an operator-visible error and the
 * slow backoff once it passed.
 */
export function resolveUnverifiedDeferral(
  attemptStartedAt: Date,
  now: Date,
): UnverifiedDeferral {
  const isWindowExpired =
    now.getTime() - attemptStartedAt.getTime() >=
    SCHEDULED_POST_VERIFICATION_WINDOW_SECONDS * 1000;
  return isWindowExpired
    ? {
        backoffSeconds: SCHEDULED_POST_UNVERIFIED_BACKOFF_SECONDS,
        code: PUBLISH_OUTCOME_UNVERIFIED_CODE,
        isWindowExpired,
        message:
          'Provider publish outcome could not be verified within the verification window; operator review needed.',
      }
    : {
        backoffSeconds: SCHEDULED_POST_VERIFICATION_BACKOFF_SECONDS,
        code: PUBLISH_OUTCOME_UNCONFIRMED_CODE,
        isWindowExpired,
        message:
          'Provider publish outcome is not confirmed yet; verification will retry.',
      };
}

/**
 * The audience to store for a published post: the one the provider applied
 * when it narrowed the request (a private YouTube channel setting), else the
 * one the post asked for.
 */
export function resolveAppliedVisibility(
  result: Pick<PublishResult, 'visibility'>,
  post: PostEntity,
) {
  return result.visibility ?? resolvePostVisibility(post.visibility);
}
