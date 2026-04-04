import { createEntityAttributes } from '@genfeedai/helpers';

export const captionAttributes = createEntityAttributes([
  'user',
  'ingredient',
  'brand',
  'content',
  'format',
  'language',
  'agentRunId',
]);
