import { createEntityAttributes } from '@genfeedai/helpers';

export const captionAttributes = createEntityAttributes([
  'user',
  'ingredient',
  'content',
  'format',
  'language',
  'workflowExecutionId',
]);
