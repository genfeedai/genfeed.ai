/**
 * Contract for the per-user subscriptions service, as consumed by OSS core
 * code.
 *
 * The concrete implementation lives in
 * `apps/server/api/src/collections/user-subscriptions/`; community
 * deployments bind the same canonical contract to a no-op implementation.
 */

/**
 * Canonical per-user subscription read model shared by the Prisma service and
 * the community stub.
 */
export interface IUserSubscriptionOssReadModel {
  id: string;
  userId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | string | null;
  isDeleted: boolean;
  plan: string | null;
  status: string;
  stripeSubscriptionId: string | null;
}

export interface IUserSubscriptionsService {
  /**
   * Find the per-user subscription for a user. Consumer reads
   * `cancelAtPeriodEnd`, `currentPeriodEnd`, `status`, and `plan`.
   * OSS no-op returns `null` — a self-hosted user with no managed billing
   * simply has no per-user subscription, which the controller handles.
   */
  findByUser(userId: string): Promise<IUserSubscriptionOssReadModel | null>;

  /**
   * Get-or-create the per-user subscription during Stripe checkout.
   * User-initiated billing: the OSS no-op THROWS `ForbiddenException` rather
   * than fabricate a record, mirroring `createForOrganization`.
   */
  getOrCreateSubscription(
    userId: string,
  ): Promise<IUserSubscriptionOssReadModel>;

  /**
   * Apply a completed Stripe checkout session to the per-user subscription.
   * Always-on webhook path — the OSS no-op returns `null` and must NOT throw.
   * `session` is `unknown` so OSS never imports the Stripe SDK session type.
   */
  updateFromStripeSession(
    userId: string,
    session: unknown,
  ): Promise<IUserSubscriptionOssReadModel | null>;
}
