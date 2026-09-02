/**
 * Contract for the subscriptions service, as consumed by OSS core code.
 *
 * Deliberately a narrow OSS read model rather than the full JSON:API
 * `ISubscription` shape. It describes the canonical scalar fields shared by
 * the Stripe-backed Prisma service and the community no-op.
 */

/**
 * Minimal OSS-facing shape of a canonical Prisma subscription row.
 *
 * The OSS implementation represents absence with `null`; a returned record
 * therefore carries the required scalar identifiers instead of Mongo-era
 * relation aliases or object-like ids.
 *
 * Layer 2 can safely swap the concrete implementation as long as the new
 * impl returns something assignable to this shape.
 */
export interface ISubscriptionOssReadModel {
  id: string;
  cancelAtPeriodEnd: boolean;
  customerId?: string | null;
  currentPeriodEnd?: Date | string | null;
  organizationId: string;
  plan?: string | null;
  stripePriceId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  userId: string;
  isDeleted: boolean;
  status: string;
}

/**
 * Canonical Prisma filter subset accepted by `findOne`.
 */
export interface ISubscriptionFindOneFilter {
  id?: string;
  organizationId?: string;
  userId?: string;
  stripeSubscriptionId?: string;
  isDeleted?: boolean;
}

/** Canonical Prisma-style query input accepted by `findAll`. */
export interface ISubscriptionFindAllInput {
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
  select?: Record<string, unknown>;
  where?: Record<string, unknown>;
}

/** Options for paginating and sorting `findAll` results. */
export interface ISubscriptionFindAllOptions {
  page?: number;
  limit?: number;
  pagination?: boolean;
  sort?: Record<string, 1 | -1>;
  [key: string]: unknown;
}

/**
 * Result of the `findAll` aggregation. OSS reads `.total` from the analytics
 * endpoint and `.docs` from the Stripe webhook reconciliation path; billing
 * call sites may read more, which is fine — the index signature keeps the type
 * open.
 *
 * `docs` mirrors `AggregatePaginateResult<T>.docs` on the concrete service
 * (`BaseService.findAll`). `total` is required for OSS-facing consumers, while
 * `totalDocs` preserves the concrete paginated service shape. The OSS no-op
 * returns both count fields as zero.
 */
export interface ISubscriptionFindAllResult {
  docs: ISubscriptionOssReadModel[];
  total: number;
  totalDocs: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  limit?: number;
  nextPage?: number | null;
  page?: number;
  pagingCounter?: number;
  prevPage?: number | null;
  totalPages?: number;
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
   * Consumer: `CreditsUtilsService` reads `.userId` to attribute transactions.
   * OSS no-op returns `null`.
   */
  findByOrganizationId(
    organizationId: string,
  ): Promise<ISubscriptionOssReadModel | null>;

  /**
   * Aggregation query; OSS reads `.total`. OSS no-op returns
   * `{ docs: [], total: 0, totalDocs: 0 }`.
   *
   * `options` is required so the stub and concrete implementations share one
   * pagination contract.
   * `enableCache` must stay in the contract: the Stripe webhook passes `false`
   * to bypass the read cache during reconciliation.
   */
  findAll(
    input: ISubscriptionFindAllInput,
    options: ISubscriptionFindAllOptions,
    enableCache?: boolean,
  ): Promise<ISubscriptionFindAllResult>;

  /**
   * Patch a subscription by id. Called from the always-on Stripe webhook
   * handler (`endpoints/webhooks/stripe`) on hot paths — invoice.paid,
   * customer.subscription.updated, etc. The OSS no-op returns `null` and must
   * NOT throw: webhooks fire continuously and a throw here would 500 the
   * webhook even on a self-hosted install that never provisioned billing.
   *
   * `data` is `unknown` so consumers never have to import the concrete
   * `UpdateSubscriptionDto`; the concrete service narrows it internally.
   */
  patch(id: string, data: unknown): Promise<ISubscriptionOssReadModel | null>;

  /**
   * Resolve a subscription from a Stripe customer id. Always-on webhook path.
   * OSS no-op returns `null`.
   */
  findByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<ISubscriptionOssReadModel | null>;

  /**
   * Reconcile a local subscription against Stripe. Always-on webhook path.
   * Takes and returns the OSS read model so neither side depends on the
   * concrete `SubscriptionDocument`. OSS no-op echoes its argument.
   */
  syncWithStripe(
    subscription: ISubscriptionOssReadModel,
  ): Promise<ISubscriptionOssReadModel>;

  /**
   * Provision a subscription for an organization. User-initiated billing
   * (Stripe checkout controller). Unlike the webhook paths, the OSS no-op
   * THROWS `ForbiddenException` here: self-hosted OSS has no managed billing,
   * and surfacing that to a user clicking "subscribe" is correct, whereas
   * silently returning a fake record would be a lie.
   *
   * `organization` is `unknown` so OSS never imports `OrganizationDocument`.
   */
  createForOrganization(
    organization: unknown,
    billingEmail: string,
    userId: string,
  ): Promise<ISubscriptionOssReadModel>;

  /**
   * Persist subscription state to the DB (OrganizationSetting.subscriptionTier).
   * Always-on webhook path. Returns `void`; the OSS no-op is a no-op (org
   * billing state is only relevant on paid installs). `subscription` is `unknown`
   * so OSS never imports the concrete sync shape.
   */
  syncSubscriptionState(
    subscription: ISubscriptionOssReadModel | null,
    stripeSubscriptionId?: string,
    stripePriceId?: string,
    status?: string,
    subscriptionTier?: string,
  ): Promise<void>;
}
