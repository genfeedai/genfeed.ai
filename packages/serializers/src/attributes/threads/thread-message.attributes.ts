import { createEntityAttributes } from '@genfeedai/helpers';

export const threadMessageAttributes = createEntityAttributes([
  'organization',
  'user',
  'role',
  'content',
  'toolCallId',
  'toolCalls',
  'metadata',
]);
