import { createEntityAttributes } from '@genfeedai/helpers';

export const creativePatternAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'patternType',
  'label',
  'description',
  'formula',
  'examples',
  'platform',
  'industry',
  'source',
  'avgPerformanceScore',
  'sampleSize',
  'scope',
  'computedAt',
  'validUntil',
]);
