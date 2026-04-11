import type { ISubscription } from './subscription.interface';

/**
 * Contract for the subscriptions service, as consumed by OSS core code.
 *
 * Layer 1 of the Phase C EE extraction split (see issue #87 and
 * `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b).
 *
 * A repo-wide grep of `subscriptionsService\.` across `apps/server/api/src/`
 * (excluding the enterprise-only `endpoints/webhooks/stripe/`,
 * `services/integrations/stripe/`, and the collection's own controllers)
 * finds the following OSS consumers:
 *
 * - `common/middleware/request-context.middleware.ts:121` — `findOne({organization, isDeleted})`
 * - `collections/users/controllers/users.controller.ts:141` — `findOne({isDeleted, user})`
 * - `collections/organizations/controllers/organizations-settings.controller.ts:206` — `findOne({organization: ObjectId})`
 * - `collections/credits/services/credits.utils.service.ts:275,373,569,656` — `findByOrganizationId(orgId)`
 * - `endpoints/analytics/analytics.controller.ts:164` — `findAll(pipeline, options)` for revenue aggregation
 *
 * Layer 2 will move the concrete implementation to `ee/packages/billing/`.
 * When `isEEEnabled() === false`, OSS ships a no-op implementation that
 * returns `null` / empty results — self-hosted deployments run with a default
 * "self-hosted" tier, so there's nothing meaningful to return.
 */

/**
 * The union of filter shapes passed to `findOne()` from OSS code today.
 * Each field is optional; callers pass only the subset they care about.
 *
 * - `organization` — string (from request context) or Mongoose ObjectId
 * - `user` — Mongoose ObjectId
 * - `isDeleted` — soft-delete filter
 * - `stripeSubscriptionId` — only used from EE-only webhooks (excluded)
 */
export interface ISubscriptionFindOneFilter {
  organization?: string | unknown;
  user?: unknown;
  isDeleted?: boolean;
}

/**
 * Options for the `findAll` aggregation pipeline call. Left as `unknown[]`
 * because the OSS call site passes a raw mongoose aggregation pipeline that
 * we do not want to over-constrain at this layer.
 */
export interface ISubscriptionFindAllOptions {
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface ISubscriptionFindAllResult {
  total?: number;
  docs?: ISubscription[];
  [key: string]: unknown;
}

export interface ISubscriptionsService {
  /**
   * Find a single subscription by filter. Used by the request-context
   * middleware, the users controller, and the organization settings
   * controller.
   *
   * OSS no-op returns `null`.
   */
  findOne(filter: ISubscriptionFindOneFilter): Promise<ISubscription | null>;

  /**
   * Find a subscription by organization id. Used by `CreditsUtilsService`
   * to attribute credit transactions back to the subscription holder.
   *
   * OSS no-op returns `null`.
   */
  findByOrganizationId(organizationId: string): Promise<ISubscription | null>;

  /**
   * Aggregation pipeline query used by the analytics endpoint to count
   * active subscriptions for revenue dashboards.
   *
   * OSS no-op returns `{ total: 0 }` (self-hosted has no paying subscribers).
   */
  findAll(
    pipeline: unknown[],
    options?: ISubscriptionFindAllOptions,
  ): Promise<ISubscriptionFindAllResult>;
}
