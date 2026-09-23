import { buildSerializer } from '@serializers/builders';
import { systemNotificationOverviewSerializerConfig } from '@serializers/configs';
export const { SystemNotificationOverviewSerializer } = buildSerializer(
  'server',
  systemNotificationOverviewSerializerConfig,
);
