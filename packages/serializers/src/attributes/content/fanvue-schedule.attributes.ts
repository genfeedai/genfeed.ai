import { createEntityAttributes } from '@genfeedai/helpers';

export const fanvueScheduleAttributes = createEntityAttributes([
  'scheduledAt',
  'status',
  'caption',
  'mediaUrls',
  'price',
  'errorMessage',
  'content',
  'organization',
  'user',
]);
