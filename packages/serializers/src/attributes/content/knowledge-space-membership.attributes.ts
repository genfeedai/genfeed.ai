import { createEntityAttributes } from '@genfeedai/helpers';

export const knowledgeSpaceMembershipAttributes = createEntityAttributes([
  'organizationId',
  'sourceId',
  'spaceId',
]);
