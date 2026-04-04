import { createEntityAttributes } from '@genfeedai/helpers';

export const taskCommentAttributes = createEntityAttributes([
  'organization',
  'task',
  'authorUserId',
  'authorAgentId',
  'body',
]);
