import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { monitoredAccountSerializerConfig } from '../../configs';

export const MonitoredAccountSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  monitoredAccountSerializerConfig,
);
