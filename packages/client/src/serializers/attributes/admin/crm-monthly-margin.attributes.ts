import { createEntityAttributes } from '@genfeedai/helpers';

export const crmMonthlyMarginAttributes = createEntityAttributes([
  'margin',
  'marginPercentage',
  'modelsCost',
  'month',
  'otherCost',
  'replicateCost',
  'revenue',
  'totalCosts',
]);
