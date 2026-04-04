import { createEntityAttributes } from '@genfeedai/helpers';

export const managementTaskAttributes = createEntityAttributes([
  'organization',
  'brand',
  'taskNumber',
  'identifier',
  'title',
  'description',
  'status',
  'priority',
  'parentId',
  'projectId',
  'goalId',
  'assigneeUserId',
  'assigneeAgentId',
  'checkoutRunId',
  'checkoutAgentId',
  'checkedOutAt',
  'linkedEntities',
]);
