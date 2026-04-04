import { monitoredAccountAttributes } from '@serializers/attributes/automation/monitored-account.attributes';
import { simpleConfig } from '@serializers/builders';

export const monitoredAccountSerializerConfig = simpleConfig(
  'monitored-account',
  monitoredAccountAttributes,
);
