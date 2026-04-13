import { createEntityAttributes } from '@genfeedai/helpers';

export const contentRunAttributes = createEntityAttributes([
  'organization',
  'brand',
  'skillSlug',
  'status',
  'input',
  'output',
  'brief',
  'variants',
  'publish',
  'analyticsSummary',
  'recommendations',
  'error',
  'duration',
  'creditsUsed',
  'source',
]);
