import { createEntityAttributes } from '@genfeedai/helpers';

export const billingAccountAttributes = createEntityAttributes([
  // Discriminant: 'account' (full snapshot, #5231) or 'organization' (reduced
  // own-organization view, #5374). Consumers must branch on this before
  // reading any field below — the two shapes populate disjoint fields.
  'kind',
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
  // Reduced own-organization view fields (#5374) — null on a full snapshot.
  'organizationId',
  'isLinked',
  'usage',
  'monthlyBudgetCredits',
  'budgetPolicy',
]);
