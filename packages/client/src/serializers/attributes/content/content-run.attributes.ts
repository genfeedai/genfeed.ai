import { createEntityAttributes } from '@genfeedai/helpers';

export const contentRunAttributes = createEntityAttributes([
  'organization',
  'brand',
  'skillSlug',
  'status',
  'input',
  'output',
  'error',
  'duration',
  'creditsUsed',
  'source',
]);
