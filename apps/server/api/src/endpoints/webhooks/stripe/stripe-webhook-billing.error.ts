import { ServiceUnavailableException } from '@nestjs/common';

export type StripeWebhookBillingErrorCode =
  | 'identity_missing'
  | 'identity_ambiguous'
  | 'identity_conflict'
  | 'invalid_payload';

export class StripeWebhookBillingError extends ServiceUnavailableException {
  constructor(public readonly code: StripeWebhookBillingErrorCode) {
    super('Stripe webhook billing reconciliation unavailable');
    this.name = 'StripeWebhookBillingError';
  }
}
