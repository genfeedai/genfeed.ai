import { createEntityAttributes } from '@genfeedai/helpers';

export const contentPatternAttributes = createEntityAttributes([
  'organization',
  'sourceCreator',
  'platform',
  'patternType',
  'templateCategory',
  'rawExample',
  'extractedFormula',
  'description',
  'placeholders',
  'sourceMetrics',
  'tags',
  'relevanceWeight',
  'usageCount',
  'sourcePostId',
  'sourcePostUrl',
  'sourcePostDate',
]);
