import { createEntityAttributes } from '@genfeedai/helpers';

export const crmAlignmentValidationAttributes = createEntityAttributes([
  'generatedAt',
  'sampledLeadIds',
  'summary',
]);
