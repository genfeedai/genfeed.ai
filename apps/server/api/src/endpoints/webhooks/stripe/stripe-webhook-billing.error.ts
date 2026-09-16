import { ServiceUnavailableException } from '@nestjs/common';

export type StripeWebhookBillingErrorCode =
  | 'identity_missing'
  | 'identity_ambiguous'
  | 'identity_conflict'
  | 'invalid_payload';

/**
 * Only `identity_missing` may be retried: it covers the checkout race where
 * the subscription, customer, or billing-account rows have not been persisted
 * yet, so a later Stripe delivery can succeed once they exist. Every other
 * code is deterministic — the same payload against the same rows fails the
 * same way on every attempt — so the controller acknowledges it with one
 * structured warning instead of letting Stripe retry it for up to 3 days.
 */
const RETRYABLE_CODES: ReadonlySet<StripeWebhookBillingErrorCode> = new Set([
  'identity_missing',
]);

export class StripeWebhookBillingError extends ServiceUnavailableException {
  readonly isRetryable: boolean;

  constructor(public readonly code: StripeWebhookBillingErrorCode) {
    super('Stripe webhook billing reconciliation unavailable');
    this.name = 'StripeWebhookBillingError';
    this.isRetryable = RETRYABLE_CODES.has(code);
  }
}
