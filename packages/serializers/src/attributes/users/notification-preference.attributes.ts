import { createEntityAttributes } from '@genfeedai/helpers';

export const notificationPreferenceAttributes = createEntityAttributes([
  'userId',
  'topic',
  'channel',
  'isEnabled',
]);
