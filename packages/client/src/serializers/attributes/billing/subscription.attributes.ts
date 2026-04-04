import { createEntityAttributes } from '@genfeedai/helpers';

export const subscriptionPreviewAttributes = createEntityAttributes([
  'currentPlan',
  'newPlan',
  'changeType',
  'proratedAmount',
  'effectiveDate',
]);

export const subscriptionAttributes = createEntityAttributes([
  'organization',
  'planId',
  'status',
  'category',
  'currentPeriodStart',
  'currentPeriodEnd',
  'cancelAtPeriodEnd',
]);
