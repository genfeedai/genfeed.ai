/**
 * Dependency-injection tokens for the billing service contracts.
 *
 * These are plain string tokens, not class references, so OSS modules can
 * `@Inject(SUBSCRIPTIONS_SERVICE)` against the {@link ISubscriptionsService}
 * interface without importing the enterprise class. The concrete provider —
 * the EE service under `ee/packages/billing/` or the OSS no-op stub — is bound
 * to the token by the `@billing-providers` alias-swapped provider module
 * (see `billing.providers.ee.ts` / `billing.providers.oss.ts`).
 *
 * Tokens are namespaced (`billing.*`) to avoid collisions in the global Nest
 * provider registry.
 */

export const SUBSCRIPTIONS_SERVICE = 'billing.SubscriptionsService' as const;

export const USER_SUBSCRIPTIONS_SERVICE =
  'billing.UserSubscriptionsService' as const;

export const SUBSCRIPTION_ATTRIBUTIONS_SERVICE =
  'billing.SubscriptionAttributionsService' as const;
