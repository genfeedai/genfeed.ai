import { createEntityAttributes } from '@genfeedai/helpers';

export const creditTransactionAttributes = createEntityAttributes([
  'organization',
  'category',
  'amount',
  'balanceBefore',
  'balanceAfter',
  'source',
  'description',
  'expiresAt',
]);
