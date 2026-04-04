import { createEntityAttributes } from '@genfeedai/helpers';

export const evaluationAttributes = createEntityAttributes([
  'organization',
  'user',
  'brand',
  'contentType',
  'content',
  'evaluationType',
  'status',
  'overallScore',
  'scores',
  'analysis',
  'flags',
  'externalContent',
  'actualPerformance',
]);
