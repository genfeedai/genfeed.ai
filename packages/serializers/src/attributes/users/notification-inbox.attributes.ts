import { createEntityAttributes } from '@genfeedai/helpers';
export const notificationInboxAttributes = createEntityAttributes([
  'topic',
  'occurredAt',
  'readAt',
  'outcome',
  'sourceHref',
  'sourceLabel',
  'failure',
  'socialReply',
  'severity',
  'activity',
]);
export const notificationInboxCountAttributes = createEntityAttributes([
  'unreadCount',
]);
