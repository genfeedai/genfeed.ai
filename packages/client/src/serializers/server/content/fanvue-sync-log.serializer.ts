import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { fanvueSyncLogSerializerConfig } from '../../configs';

export const FanvueSyncLogSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueSyncLogSerializerConfig,
);
