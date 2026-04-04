import { createEntityAttributes } from '@genfeedai/helpers';

export const scheduleAttributes = createEntityAttributes([
  'organization',
  'user',
  'content',
  'contentType',
  'platform',
  'brand',
  'scheduledAt',
  'status',
  'schedulingMethod',
  'expectedEngagement',
  'publishedAt',
  'errorMessage',
  'performance',
]);
