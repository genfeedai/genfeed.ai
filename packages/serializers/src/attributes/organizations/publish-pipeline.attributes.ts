import { createEntityAttributes } from '@genfeedai/helpers';

export const publishPipelineAttributes = createEntityAttributes([
  'counts',
  'generatedAt',
  'itemLimit',
  'items',
  'reviewQueue',
  'since',
  'windowDays',
]);
