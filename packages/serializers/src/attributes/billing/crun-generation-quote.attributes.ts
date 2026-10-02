import { createEntityAttributes } from '@genfeedai/helpers';

export const crunGenerationQuoteAttributes: string[] = createEntityAttributes([
  'quoteId',
  'expiresAt',
  'modelKey',
  'contractVersion',
  'credits',
  'billingMode',
  'isAvailable',
  'reasonCode',
]);
