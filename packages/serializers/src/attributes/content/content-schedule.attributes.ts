import { createEntityAttributes } from '@genfeedai/helpers';

export const contentScheduleAttributes = createEntityAttributes([
  'organization',
  'brand',
  'name',
  'cronExpression',
  'timezone',
  'skillSlugs',
  'skillParams',
  'isEnabled',
  'lastRunAt',
  'nextRunAt',
]);
