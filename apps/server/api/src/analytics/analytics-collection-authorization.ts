import type { AnalyticsCollectionAuthorization } from '@api/analytics/analytics-collection-action.types';
import { ForbiddenException } from '@nestjs/common';

const failures = new WeakSet<object>();

/**
 * Ordinary collection runs under the platform scheduler's authority and carries no actor;
 * only a supplied authorization is validated. Actor-gated work (breakout capture) checks
 * for the authorization itself and is skipped without one — never substituted from a post
 * or workflow creator.
 * Preserve native authorization exception identity while distinguishing it from provider failures.
 */
export async function admitAnalyticsCollection(
  authorization: AnalyticsCollectionAuthorization | undefined,
  organizationId?: string,
): Promise<void> {
  if (authorization === undefined) return;
  try {
    if (typeof authorization.admit !== 'function')
      throw new ForbiddenException('analytics_collection_actor_required');
    if (
      organizationId !== undefined &&
      authorization.initiatingActor.organizationId !== organizationId
    )
      throw new ForbiddenException('analytics_collection_actor_scope_changed');
    await authorization.admit();
  } catch (error: unknown) {
    const failure =
      error !== null &&
      (typeof error === 'object' || typeof error === 'function')
        ? error
        : new ForbiddenException('analytics_collection_authorization_failed', {
            cause: error,
          });
    failures.add(failure);
    throw failure;
  }
}

export function isAnalyticsCollectionAuthorizationFailure(
  error: unknown,
): boolean {
  return (
    error !== null &&
    (typeof error === 'object' || typeof error === 'function') &&
    failures.has(error)
  );
}
