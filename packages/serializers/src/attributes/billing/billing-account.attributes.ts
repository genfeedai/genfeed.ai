import { createEntityAttributes } from '@genfeedai/helpers';

export const billingAccountAttributes = createEntityAttributes([
  'label',
  'status',
  'planTier',
  'callerRole',
  'linkedOrganizations',
  'wallet',
  'subscriptionStatus',
  'currentPeriodEnd',
  'isIdentityStale',
  'capabilities',
]);
