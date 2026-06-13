/**
 * Contract for the subscription-attributions service, as consumed by OSS core
 * code.
 *
 * Layer 1 of the Phase C EE extraction split (see issue #87). The concrete
 * implementation lives in `ee/packages/billing/src/subscription-attributions/`
 * and is swapped in via the `@billing-providers` alias when an enterprise
 * license is present; OSS builds bind {@link ISubscriptionAttributionsService}
 * to a no-op stub.
 *
 * ## Read surface (what OSS actually reads)
 *
 * Verified via repo-wide grep on `apps/server/api/src/`:
 *
 * | Consumer | Method | Return used |
 * |---|---|---|
 * | `endpoints/webhooks/stripe/webhooks.stripe.service.ts:1130` | `trackSubscription(dto, organizationId)` | discarded |
 *
 * The webhook fires `trackSubscription` for revenue attribution and ignores
 * the result, so the contract return is deliberately `unknown`: OSS never has
 * to model the enterprise `NormalizedSubscriptionAttribution`, and the no-op
 * can return `null` without lying about any field.
 */

export interface ISubscriptionAttributionsService {
  /**
   * Record a subscription event for content/revenue attribution. Always-on
   * Stripe webhook path — the OSS no-op returns `null` and must NOT throw, as
   * a throw would 500 the webhook on a self-hosted install that never opted
   * into attribution analytics.
   *
   * `dto` is `unknown` so OSS never imports the enterprise
   * `TrackSubscriptionDto`; the concrete EE service narrows it internally.
   */
  trackSubscription(dto: unknown, organizationId: string): Promise<unknown>;
}
