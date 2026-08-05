import { createEntityAttributes } from '@genfeedai/helpers';

export const taskCommentAttributes = createEntityAttributes([
  'organizationId',
  'taskId',
  'authorUserId',
  'authorAgentId',
  'body',
]);
