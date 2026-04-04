import { createEntityAttributes } from '@genfeedai/helpers';

export const fanvueEarningsAttributes = createEntityAttributes([
  'amount',
  'currency',
  'type',
  'externalTransactionId',
  'earnedAt',
  'organization',
  'user',
]);
