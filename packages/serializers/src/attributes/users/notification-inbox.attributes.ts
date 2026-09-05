import { createEntityAttributes } from '@genfeedai/helpers';
export const notificationInboxAttributes = createEntityAttributes([
  'topic',
  'occurredAt',
  'readAt',
  'outcome',
  'sourceHref',
  'sourceLabel',
  'failure',
]);
export const notificationInboxCountAttributes = createEntityAttributes([
  'unreadCount',
]);
