import { createEntityAttributes } from '@genfeedai/helpers';

export const creditUsageAttributes = createEntityAttributes([
  'currentBalance',
  'usage7Days',
  'usage30Days',
  'trendPercentage',
  'breakdown',
]);
