import { buildSerializer } from '@serializers/builders';
import { monitoredAccountSerializerConfig } from '@serializers/configs';

export const { MonitoredAccountSerializer } = buildSerializer(
  'server',
  monitoredAccountSerializerConfig,
);
