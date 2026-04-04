import { createEntityAttributes } from '@genfeedai/helpers';

export const subscriptionAttributionAttributes = createEntityAttributes([
  'organization',
  'stripeSubscriptionId',
  'stripeCustomerId',
  'user',
  'email',
  'plan',
  'amount',
  'currency',
  'source',
  'utm',
  'subscribedAt',
  'expiresAt',
  'status',
]);
