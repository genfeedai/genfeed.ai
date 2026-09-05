import { createEntityAttributes } from '@genfeedai/helpers';

export const knowledgeSpaceAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'scope',
  'title',
  'isInbox',
]);
