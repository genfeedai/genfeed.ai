import { createEntityAttributes } from '@genfeedai/helpers';

export const cronRunAttributes = createEntityAttributes([
  'cronJob',
  'organization',
  'user',
  'trigger',
  'status',
  'startedAt',
  'endedAt',
  'error',
  'artifacts',
]);
