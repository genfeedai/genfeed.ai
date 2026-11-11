import { createEntityAttributes } from '@genfeedai/helpers';

export const threadMessageAttributes = createEntityAttributes([
  'artifactReferences',
  'artifactVersionPinIds',
  'organization',
  'user',
  'role',
  'content',
  'toolCallId',
  'toolCalls',
  'metadata',
]);
