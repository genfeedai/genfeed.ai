import { createEntityAttributes } from '@genfeedai/helpers';

export const creditBalanceAttributes = createEntityAttributes([
  'organization',
  'balance',
  'expiresAt',
]);
