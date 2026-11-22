import { ServiceUnavailableException } from '@nestjs/common';

export type StripeWebhookBillingErrorCode =
  | 'identity_missing'
  | 'identity_ambiguous'
  | 'identity_conflict'
  | 'identity_stale'
  | 'claim_in_flight'
  | 'invalid_payload';

/**
 * Three codes may be retried. `identity_missing` covers the checkout race where
 * the subscription, customer, or billing-account rows have not been persisted
 * yet, so a later Stripe delivery can succeed once they exist. `identity_stale`
 * covers the guarded write missing its row because a concurrent delivery
 * (for example `customer.subscription.created` racing `invoice.paid`) changed
 * the identity fields between `resolve` and `persist`; a retry re-resolves
 * against the updated row and succeeds. `claim_in_flight` means another
 * delivery holds the claim on the same event or checkout session right now;
 * acknowledging would tell Stripe the work is done while that delivery may
 * still fail, so Stripe retries once the holder has finished or its claim has
 * expired. Every other code is deterministic —
 * the same payload against the same rows fails the same way on every attempt —
 * so the controller acknowledges it with one structured warning instead of
 * letting Stripe retry it for up to 3 days.
 */
const RETRYABLE_CODES: ReadonlySet<StripeWebhookBillingErrorCode> = new Set([
  'identity_missing',
  'identity_stale',
  'claim_in_flight',
]);

export class StripeWebhookBillingError extends ServiceUnavailableException {
  readonly isRetryable: boolean;

  constructor(public readonly code: StripeWebhookBillingErrorCode) {
    super('Stripe webhook billing reconciliation unavailable');
    this.name = 'StripeWebhookBillingError';
    this.isRetryable = RETRYABLE_CODES.has(code);
  }
}
