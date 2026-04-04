import { createEntityAttributes } from '@genfeedai/helpers';

export const agentThreadAttributes = createEntityAttributes([
  'organization',
  'user',
  'isPinned',
  'title',
  'source',
  'status',
]);
