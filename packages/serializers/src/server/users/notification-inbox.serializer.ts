import { buildSerializer } from '@serializers/builders';
import {
  notificationInboxCountSerializerConfig,
  notificationInboxSerializerConfig,
} from '@serializers/configs/users/notification-inbox.config';
export const { NotificationInboxSerializer } = buildSerializer(
  'server',
  notificationInboxSerializerConfig,
);
export const { NotificationInboxCountSerializer } = buildSerializer(
  'server',
  notificationInboxCountSerializerConfig,
);
