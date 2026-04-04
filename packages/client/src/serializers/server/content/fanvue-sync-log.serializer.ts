import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { fanvueSyncLogSerializerConfig } from '../../configs';

export const FanvueSyncLogSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueSyncLogSerializerConfig,
);
