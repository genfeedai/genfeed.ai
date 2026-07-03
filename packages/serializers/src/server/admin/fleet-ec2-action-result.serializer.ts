import { buildSerializer } from '@serializers/builders';
import { fleetEc2ActionResultSerializerConfig } from '@serializers/configs';

export const { FleetEc2ActionResultSerializer } = buildSerializer(
  'server',
  fleetEc2ActionResultSerializerConfig,
);
