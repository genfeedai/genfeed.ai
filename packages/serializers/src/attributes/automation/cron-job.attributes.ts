import { createEntityAttributes } from '@genfeedai/helpers';

export const cronJobAttributes = createEntityAttributes([
  'organization',
  'user',
  'name',
  'jobType',
  'enabled',
  'schedule',
  'timezone',
  'payload',
  'lastRunAt',
  'lastStatus',
  'nextRunAt',
  'consecutiveFailures',
]);
