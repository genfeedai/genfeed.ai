import { createEntityAttributes } from '@genfeedai/helpers';

export const patternPlaybookAttributes = createEntityAttributes([
  'organization',
  'createdBy',
  'name',
  'description',
  'platform',
  'niche',
  'insights',
  'sourceCreators',
  'patternsCount',
  'lastUpdatedAt',
  'isActive',
]);
