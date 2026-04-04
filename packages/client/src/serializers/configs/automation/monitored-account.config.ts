import { monitoredAccountAttributes } from '../../attributes/automation/monitored-account.attributes';
import { simpleConfig } from '../../builders';

export const monitoredAccountSerializerConfig = simpleConfig(
  'monitored-account',
  monitoredAccountAttributes,
);
