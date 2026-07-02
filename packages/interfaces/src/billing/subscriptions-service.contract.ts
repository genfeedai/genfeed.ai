/**
 * Contract for the subscriptions service, as consumed by OSS core code.
 *
 * Deliberately a narrow OSS read model rather than the full JSON:API
 * `ISubscription` shape: the concrete enterprise service returns raw database
 * documents (bare identifier fields, no populated relations), so this contract
 * only describes the fields OSS consumers actually read. Both the enterprise
 * document and the OSS no-op satisfy it without either lying about its shape.
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
  id?: SubscriptionRefId;
  cancelAtPeriodEnd?: boolean | null;
  customer?: SubscriptionRefId | null;
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
  stripeSubscriptionId?: string;
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
 * endpoint and `.docs` from the Stripe webhook reconciliation path; enterprise
 * call sites may read more, which is fine — the index signature keeps the type
 * open.
 *
 * `docs` mirrors `AggregatePaginateResult<T>.docs` on the concrete EE service
 * (`BaseService.findAll`). The webhook reads `data.docs` then guards
 * `length === 0`, so the OSS no-op returns `{ docs: [], total: 0 }`.
 */
export interface ISubscriptionFindAllResult {
  docs?: ISubscriptionOssReadModel[];
  /**
   * Optional, not required: the concrete EE `findAll` returns
   * `AggregatePaginateResult<SubscriptionDocument>`, which exposes `totalDocs`
   * rather than a statically-guaranteed `total`, while the OSS no-op returns
   * `{ total: 0 }`. Keeping this optional lets both producers satisfy the
   * contract without either lying about its shape; OSS reads it defensively.
   */
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
   * Aggregation query; OSS reads `.total`. OSS no-op returns `{ total: 0 }`.
   *
   * `options` is required (not optional): the concrete `BaseService.findAll`
   * dereferences `options.pagination` unconditionally, so omitting it would
   * TypeError on the EE path. `input` is `unknown` because callers pass a
   * Prisma query object (`{ where }`) or a legacy aggregation array.
   * `enableCache` must stay in the contract: the Stripe webhook passes `false`
   * to bypass the read cache during reconciliation.
   */
  findAll(
    input: unknown,
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
   * `data` is `unknown` so OSS never has to import the enterprise
   * `UpdateSubscriptionDto`; the concrete EE service narrows it internally.
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
   * enterprise `SubscriptionDocument`. OSS no-op echoes its argument.
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
   * Always-on webhook path. Returns `void`; the OSS no-op is a no-op (enterprise
   * billing state is only relevant on paid installs). `subscription` is `unknown`
   * so OSS never imports the enterprise sync shape.
   */
  syncSubscriptionState(
    subscription: unknown,
    stripeSubscriptionId?: string,
    stripePriceId?: string,
    status?: string,
    subscriptionTier?: string,
  ): Promise<void>;
}
