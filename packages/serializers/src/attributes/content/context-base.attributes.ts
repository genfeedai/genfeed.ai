import { createEntityAttributes } from '@genfeedai/helpers';

export const contextBaseAttributes = createEntityAttributes([
  'organization',
  'createdBy',
  'label',
  'description',
  'category',
  'source',
  'sourceUrl',
  'sourceBrand',
  'lastAnalyzed',
  'purpose',
  'sources',
  'entryCount',
  'usageCount',
  'isActive',
]);
