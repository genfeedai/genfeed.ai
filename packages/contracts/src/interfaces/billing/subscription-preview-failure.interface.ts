/**
 * Stable, actionable causes for a failed `POST /subscriptions/current/preview`.
 * Each value is returned verbatim as the JSON:API error `code` so clients can
 * branch on it without parsing prose.
 */
export const SubscriptionPreviewFailureCode = {
  /** The Stripe subscription belongs to a different customer than the org's. */
  BILLING_CUSTOMER_MISMATCH: 'billing_customer_mismatch',
  /** No Stripe customer could be resolved for the organization. */
  BILLING_CUSTOMER_MISSING: 'billing_customer_missing',
  /** Stripe rejected the request for a non-transient reason (auth, permission, API fault). */
  BILLING_PROVIDER_REJECTED: 'billing_provider_rejected',
  /** Stripe was unreachable or rate limited. Retry after `retryAfterSeconds`. */
  BILLING_PROVIDER_UNAVAILABLE: 'billing_provider_unavailable',
  /** The local subscription row has no current Stripe price. */
  CURRENT_PRICE_MISSING: 'current_price_missing',
  /** No organization is bound to the request. */
  ORGANIZATION_REQUIRED: 'organization_required',
  /** An unclassified fault; reported to error tracking. */
  PREVIEW_FAILED: 'preview_failed',
  /** Stripe could not price the change (invalid proration, currency mismatch, ...). */
  PREVIEW_REJECTED: 'preview_rejected',
  /** The requested or current price does not exist in Stripe. */
  PRICE_NOT_FOUND: 'price_not_found',
  /** The local row has no Stripe subscription, or Stripe no longer has it. */
  STRIPE_SUBSCRIPTION_MISSING: 'stripe_subscription_missing',
  /** The Stripe subscription items no longer match the price on record. */
  STRIPE_SUBSCRIPTION_OUT_OF_SYNC: 'stripe_subscription_out_of_sync',
  /** The organization has no subscription row at all. */
  SUBSCRIPTION_MISSING: 'subscription_missing',
} as const;

export type SubscriptionPreviewFailureCode =
  (typeof SubscriptionPreviewFailureCode)[keyof typeof SubscriptionPreviewFailureCode];

/**
 * Retry contract carried in the JSON:API error `meta`. A retryable failure
 * allows at most `maxRetries` further attempts, each no sooner than
 * `retryAfterSeconds` after the previous response. Non-retryable failures
 * carry `maxRetries: 0` and `retryAfterSeconds: null`.
 */
export interface ISubscriptionPreviewFailureMeta {
  isRetryable: boolean;
  maxRetries: number;
  retryAfterSeconds: number | null;
}

/** JSON:API error member emitted for a classified preview failure. */
export interface ISubscriptionPreviewFailureError {
  code: SubscriptionPreviewFailureCode;
  detail: string;
  meta: ISubscriptionPreviewFailureMeta;
  status: string;
  title: string;
}
