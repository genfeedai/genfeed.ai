import { buildSerializer } from '@serializers/builders';
import { notificationPreferenceSerializerConfig } from '@serializers/configs';

export const { NotificationPreferenceSerializer } = buildSerializer(
  'server',
  notificationPreferenceSerializerConfig,
);
