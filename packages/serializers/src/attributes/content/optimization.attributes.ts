import { createEntityAttributes } from '@genfeedai/helpers';

export const optimizationAttributes = createEntityAttributes([
  'organization',
  'user',
  'score',
  'originalContent',
  'optimizedContent',
  'contentType',
  'platform',
  'changes',
  'improvementScore',
  'goals',
  'wasApplied',
]);
