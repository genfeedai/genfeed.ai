import { createEntityAttributes } from '@genfeedai/helpers';

export const contentPlanAttributes = createEntityAttributes([
  'organization',
  'brand',
  'createdBy',
  'name',
  'description',
  'status',
  'periodStart',
  'periodEnd',
  'itemCount',
  'executedCount',
]);
