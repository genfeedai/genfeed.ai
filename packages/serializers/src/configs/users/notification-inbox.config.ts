import {
  notificationInboxAttributes,
  notificationInboxCountAttributes,
} from '@serializers/attributes/users/notification-inbox.attributes';
import { simpleConfig } from '@serializers/builders';
export const notificationInboxSerializerConfig = simpleConfig(
  'notification-inbox',
  notificationInboxAttributes,
);
export const notificationInboxCountSerializerConfig = simpleConfig(
  'notification-inbox-count',
  notificationInboxCountAttributes,
);
