import { systemNotificationOverviewAttributes } from '@serializers/attributes/admin/system-notification-overview.attributes';
import { simpleConfig } from '@serializers/builders';
export const systemNotificationOverviewSerializerConfig = simpleConfig(
  'system-notification-overview',
  systemNotificationOverviewAttributes,
);
