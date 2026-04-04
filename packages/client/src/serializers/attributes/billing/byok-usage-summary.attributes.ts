import { createEntityAttributes } from '@genfeedai/helpers';

export const byokUsageSummaryAttributes = createEntityAttributes([
  'billableUsage',
  'billingStatus',
  'freeRemaining',
  'freeThreshold',
  'periodEnd',
  'periodStart',
  'projectedFee',
  'rollover',
  'totalUsage',
]);
