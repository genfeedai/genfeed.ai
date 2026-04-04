import { createEntityAttributes } from '@genfeedai/helpers';

export const contextEntryAttributes = createEntityAttributes([
  'contextBase',
  'organization',
  'content',
  'embedding',
  'metadata',
  'relevanceWeight',
]);
