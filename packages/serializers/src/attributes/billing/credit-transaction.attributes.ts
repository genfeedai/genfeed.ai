import { createEntityAttributes } from '@genfeedai/helpers';

export const creditTransactionAttributes = createEntityAttributes([
  'amount',
  'balanceAfter',
  'category',
  'createdAt',
  'description',
  'metadata',
  'organizationId',
  'referenceId',
  'referenceType',
  'source',
]);
