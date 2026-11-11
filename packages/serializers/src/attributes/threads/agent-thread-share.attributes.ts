import { createEntityAttributes } from '@genfeedai/helpers';

export const agentThreadShareAttributes = createEntityAttributes([
  'grantedByUserId',
  'level',
  'organizationId',
  'scope',
  'targetBrandId',
  'targetUserId',
  'threadId',
]);
