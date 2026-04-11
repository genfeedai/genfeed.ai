import type { ISubscription } from './subscription.interface';

/**
 * Contract for the subscriptions service, as consumed by OSS core code.
 *
 * Layer 1 of the Phase C EE extraction split (see issue #87 and
 * `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b).
 *
 * The OSS surface is deliberately tiny. The only OSS consumer is
 * `apps/server/api/src/common/middleware/request-context.middleware.ts:121`,
 * which hydrates the per-request subscription tier for every authenticated
 * request. Everything else (Stripe sync, plan changes, preview, Clerk metadata
 * sync) is enterprise-only and lives alongside the concrete
 * `SubscriptionsService` implementation, which will move to
 * `ee/packages/billing/` in a follow-up PR (Phase C Layer 2).
 *
 * When `isEEEnabled() === false`, OSS ships a no-op implementation that
 * returns `null` (treat the request as having no active paid subscription —
 * self-hosted deployments run with a default "self-hosted" tier).
 */
export interface ISubscriptionFindOneFilter {
  organization: string;
  isDeleted: boolean;
}

export interface ISubscriptionsService {
  /**
   * Find a single subscription by filter. Used by the request-context
   * middleware to hydrate `stripeSubscriptionStatus` on every authenticated
   * request.
   *
   * OSS no-op returns `null`.
   */
  findOne(filter: ISubscriptionFindOneFilter): Promise<ISubscription | null>;
}
