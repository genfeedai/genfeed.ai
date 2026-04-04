import { createEntityAttributes } from '@genfeedai/helpers';

export const crmTaskAttributes = createEntityAttributes([
  'assignedTo',
  'company',
  'description',
  'dueDate',
  'lead',
  'organization',
  'priority',
  'status',
  'title',
]);
