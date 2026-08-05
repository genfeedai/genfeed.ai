import { createEntityAttributes } from '@genfeedai/helpers';

export const subscriptionPreviewAttributes = createEntityAttributes([
  'currentPlan',
  'newPlan',
  'changeType',
  'proratedAmount',
  'effectiveDate',
]);

export const subscriptionAttributes = createEntityAttributes([
  'organizationId',
  'userId',
  'customerId',
  'plan',
  'stripePriceId',
  'stripeSubscriptionId',
  'status',
  'currentPeriodStart',
  'currentPeriodEnd',
  'cancelAtPeriodEnd',
]);
