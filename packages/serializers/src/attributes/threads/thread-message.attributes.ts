import { createEntityAttributes } from '@genfeedai/helpers';

export const threadMessageAttributes = createEntityAttributes([
  'artifactReferences',
  'artifactVersionPinIds',
  'organization',
  'user',
  'userId',
  'role',
  'content',
  'toolCallId',
  'toolCalls',
  'metadata',
  'mentionedUserIds',
  'mentions',
]);
