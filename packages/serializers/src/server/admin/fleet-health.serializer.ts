import { buildSerializer } from '@serializers/builders';
import { fleetHealthSerializerConfig } from '@serializers/configs';

export const { FleetHealthSerializer } = buildSerializer(
  'server',
  fleetHealthSerializerConfig,
);
