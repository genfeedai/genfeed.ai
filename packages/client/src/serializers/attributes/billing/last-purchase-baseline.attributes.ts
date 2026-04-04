import { createEntityAttributes } from '@genfeedai/helpers';

export const lastPurchaseBaselineAttributes = createEntityAttributes([
  'lastPurchaseCredits',
  'usedSinceLastPurchase',
  'currentBalance',
  'usedPercent',
  'lastPurchaseAt',
]);
