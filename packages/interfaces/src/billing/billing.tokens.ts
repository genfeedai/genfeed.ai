/**
 * Dependency-injection tokens for the billing service contracts.
 *
 * These are plain string tokens, not class references, so consumers can
 * `@Inject(SUBSCRIPTIONS_SERVICE)` against the {@link ISubscriptionsService}
 * interface without importing the concrete class. The concrete provider —
 * the Stripe-backed service under
 * `apps/server/api/src/collections/{subscriptions,user-subscriptions,subscription-attributions}/`
 * or the community no-op stub — is bound to the token at boot by the runtime
 * gate in `apps/server/api/src/common/subscriptions/billing.providers.ts`.
 *
 * Tokens are namespaced (`billing.*`) to avoid collisions in the global Nest
 * provider registry.
 */

export const SUBSCRIPTIONS_SERVICE = 'billing.SubscriptionsService' as const;

export const USER_SUBSCRIPTIONS_SERVICE =
  'billing.UserSubscriptionsService' as const;

export const SUBSCRIPTION_ATTRIBUTIONS_SERVICE =
  'billing.SubscriptionAttributionsService' as const;
