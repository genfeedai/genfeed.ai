import { createEntityAttributes } from '@genfeedai/helpers';

export const templateMetadataAttributes = createEntityAttributes([
  'template',

  'estimatedTime',
  'difficulty',
  'goals',
  'version',
  'author',
  'license',
  'requiredFeatures',
  'compatiblePlatforms',
  'successRate',
  'averageQuality',
  'usageCount',
  'lastUsed',
]);
