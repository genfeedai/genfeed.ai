import { createEntityAttributes } from '@genfeedai/helpers';

export const stripeCheckoutAttributes = createEntityAttributes([
  'stripePriceId',
  'quantity',
  'successUrl',
  'cancelUrl',
]);

export const stripeUrlAttributes = createEntityAttributes([
  'customer',
  'status',
  'url',
  'expiresAt',
]);
