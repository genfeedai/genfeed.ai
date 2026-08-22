import { notificationPreferenceAttributes } from '@serializers/attributes/users/notification-preference.attributes';
import { simpleConfig } from '@serializers/builders';

export const notificationPreferenceSerializerConfig = simpleConfig(
  'notification-preference',
  notificationPreferenceAttributes,
);
