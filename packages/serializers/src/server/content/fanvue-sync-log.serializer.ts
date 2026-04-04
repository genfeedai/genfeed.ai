import { buildSerializer } from '@serializers/builders';
import { fanvueSyncLogSerializerConfig } from '@serializers/configs';

export const { FanvueSyncLogSerializer } = buildSerializer(
  'server',
  fanvueSyncLogSerializerConfig,
);
