/**
 * Contract for the per-user subscriptions service, as consumed by OSS core
 * code.
 *
 * Layer 1 of the Phase C EE extraction split (see issue #87). The concrete
 * implementation lives in `ee/packages/billing/src/user-subscriptions/` and is
 * swapped in via the `@billing-providers` alias when an enterprise license is
 * present; OSS builds bind {@link IUserSubscriptionsService} to a no-op stub.
 *
 * ## Read surface (what OSS actually reads)
 *
 * Verified via repo-wide grep on `apps/server/api/src/`:
 *
 * | Consumer | Method | Fields read |
 * |---|---|---|
 * | `services/integrations/stripe/controllers/user-stripe.controller.ts:122` | `getOrCreateSubscription(userId, stripeCustomerId)` | return discarded |
 * | `services/integrations/stripe/controllers/user-stripe.controller.ts:229` | `findByUser(userId)` | `cancelAtPeriodEnd`, `currentPeriodEnd`, `status`, `type` (behind `'type' in subscription`) |
 * | `endpoints/webhooks/stripe/webhooks.stripe.service.ts:1025` | `updateFromStripeSession(userId, session)` | return discarded |
 *
 * Only `findByUser` has its result read, so it is the only method whose return
 * model needs concrete fields. The other two return the same read model purely
 * so the enterprise `UserSubscriptionDocument` stays assignable to it.
 */

/**
 * Minimal OSS-facing shape of a per-user subscription record. Every field is
 * optional: the OSS no-op returns `null`, and enterprise data may have
 * schema-nullable fields during trials/cancellations. `type` is read behind a
 * `'type' in subscription` guard, so its presence is never assumed at runtime.
 */
export interface IUserSubscriptionOssReadModel {
  _id?: string | { toString(): string };
  id?: string | { toString(): string };
  user?: string | { toString(): string };
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: Date | string | null;
  status?: string | null;
  type?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export interface IUserSubscriptionsService {
  /**
   * Find the per-user subscription for a user. Consumer reads
   * `cancelAtPeriodEnd`, `currentPeriodEnd`, `status`, and (guarded) `type`.
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
    stripeCustomerId: string,
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
