import { buildSerializer } from '@serializers/builders';
import { fleetEc2InstanceSerializerConfig } from '@serializers/configs';

export const { FleetEc2InstanceSerializer } = buildSerializer(
  'server',
  fleetEc2InstanceSerializerConfig,
);
