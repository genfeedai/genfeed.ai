import { buildSerializer } from '@serializers/builders';
import { fleetServiceStatusSerializerConfig } from '@serializers/configs';

export const { FleetServiceStatusSerializer } = buildSerializer(
  'server',
  fleetServiceStatusSerializerConfig,
);
