/**
 * Contract for the subscriptions service, as consumed by OSS core code.
 *
 * Layer 1 of the Phase C EE extraction split (see issue #87 and
 * `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b).
 *
 * ## Read surface (what OSS actually reads)
 *
 * Verified via repo-wide grep on `apps/server/api/src/`:
 *
 * | Consumer | Method | Fields read |
 * |---|---|---|
 * | `common/middleware/request-context.middleware.ts:121` | `findOne({organization, isDeleted})` | `status` |
 * | `collections/users/controllers/users.controller.ts:141` | `findOne({isDeleted, user})` then `findOne({isDeleted, organization: ObjectId})` | `status` |
 * | `collections/organizations/controllers/organizations-settings.controller.ts:206` | `findOne({organization: ObjectId})` | entire doc, passed to `serializeSingle(req, SubscriptionSerializer, data)` |
 * | `collections/credits/services/credits.utils.service.ts:275,373,569,656` | `findByOrganizationId(orgId)` | `user` (passed to `usersService.findOne({_id: subscription.user})`) |
 * | `endpoints/analytics/analytics.controller.ts:164` | `findAll({ where }, options)` | `total` |
 *
 * ## Why a narrow read model
 *
 * The concrete `SubscriptionsService` extends `BaseService<SubscriptionDocument>`
 * and inherits `findOne()` returning `Promise<SubscriptionDocument | null>`.
 * `SubscriptionDocument` is a database document type with raw identifier
 * fields — **not** the full JSON:API `ISubscription` shape which uses nested
 * `IOrganization` / `IUser` objects and string timestamps.
 *
 * An earlier draft of this contract (commit `374841ef`) returned `ISubscription`.
 * Codex adversarial review on 2026-04-11 flagged this as a type lie:
 * `SubscriptionDocument` is not assignable to `ISubscription` because it lacks
 * the populated relations and some required fields. The compiler was accepting
 * `implements ISubscriptionsService` via structural subtyping quirks around
 * inherited generic methods, not because the types actually matched.
 *
 * The fix is a minimal **OSS read model** that describes only what OSS
 * consumers read. Both the enterprise document and a POJO OSS no-op can
 * satisfy it without either side lying about its shape.
 */

/**
 * ID-like reference — accepts `string` or any object with a stable
 * `toString()` representation (for example an ObjectId-like wrapper).
 * OSS either passes this straight into another query or stringifies it; it
 * never relies on a more specific runtime shape.
 */
export type SubscriptionRefId = string | { toString(): string };

/**
 * Minimal OSS-facing shape of a subscription record. Every field is optional
 * because the OSS no-op returns `null` and real enterprise data may have
 * schema-nullable fields during trials/cancellations.
 *
 * Layer 2 can safely swap the concrete implementation as long as the new
 * impl returns something assignable to this shape.
 */
export interface ISubscriptionOssReadModel {
  _id?: SubscriptionRefId;
  customerId?: SubscriptionRefId | null;
  currentPeriodEnd?: Date | string | null;
  organization?: SubscriptionRefId;
  plan?: string | null;
  stripePriceId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  type?: string | null;
  user?: SubscriptionRefId;
  isDeleted?: boolean;
  status?: string | null;
}

/**
 * Filter shape for `findOne`. Fields are optional because OSS callers pass
 * different subsets (`organization+isDeleted`, `user+isDeleted`,
 * `organization` alone).
 */
export interface ISubscriptionFindOneFilter {
  _id?: SubscriptionRefId;
  organization?: SubscriptionRefId;
  user?: SubscriptionRefId;
  isDeleted?: boolean;
}

/**
 * Options for the `findAll` aggregation call. OSS only uses the
 * `{$count: 'total'}` stage today, so the pipeline is typed loosely.
 */
export interface ISubscriptionFindAllOptions {
  page?: number;
  limit?: number;
  pagination?: boolean;
  [key: string]: unknown;
}

/**
 * Result of the `findAll` aggregation. OSS reads `.total` from the analytics
 * endpoint; enterprise call sites may read more, which is fine — the index
 * signature keeps the type open.
 */
export interface ISubscriptionFindAllResult {
  total?: number;
  [key: string]: unknown;
}

export interface ISubscriptionsService {
  /**
   * Find a single subscription by filter.
   * Consumers: middleware, users controller, organization settings controller.
   * OSS no-op returns `null`.
   */
  findOne(
    filter: ISubscriptionFindOneFilter,
  ): Promise<ISubscriptionOssReadModel | null>;

  /**
   * Find a subscription by organization id.
   * Consumer: `CreditsUtilsService` reads `.user` to attribute transactions.
   * OSS no-op returns `null`.
   */
  findByOrganizationId(
    organizationId: string,
  ): Promise<ISubscriptionOssReadModel | null>;

  /**
   * Aggregation pipeline query. OSS analytics endpoint reads `.total`.
   * OSS no-op returns `{ total: 0 }`.
   *
   * `options` is **required**, not optional. `BaseService.findAll` (inherited
   * by the concrete `SubscriptionsService`) dereferences `options.pagination`
   * unconditionally, so a Layer 2 no-op accepting a plain `findAll(pipeline)`
   * would expose callers to a `TypeError` on the EE path. Greptile flagged
   * this as a P1 mismatch in PR #163 review — contract now matches runtime.
   */
  findAll(
    pipeline: unknown[],
    options: ISubscriptionFindAllOptions,
  ): Promise<ISubscriptionFindAllResult>;
}
