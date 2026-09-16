import { BadRequestException } from '@nestjs/common';

/**
 * Why `StripeService.getUpcomingInvoice` refused to ask Stripe for a preview.
 * These are local consistency checks between the persisted subscription and
 * the Stripe subscription, not Stripe API failures.
 */
export const StripeUpcomingInvoiceErrorCode = {
  CUSTOMER_MISMATCH: 'customer_mismatch',
  INVALID_PRICE_ID: 'invalid_price_id',
  INVALID_QUANTITY: 'invalid_quantity',
  SUBSCRIPTION_ITEM_MISSING: 'subscription_item_missing',
} as const;

export type StripeUpcomingInvoiceErrorCode =
  (typeof StripeUpcomingInvoiceErrorCode)[keyof typeof StripeUpcomingInvoiceErrorCode];

export class StripeUpcomingInvoiceError extends BadRequestException {
  constructor(
    public readonly code: StripeUpcomingInvoiceErrorCode,
    detail: string,
  ) {
    super(detail);
    this.name = 'StripeUpcomingInvoiceError';
  }
}
