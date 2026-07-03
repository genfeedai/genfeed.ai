import { buildSerializer } from '@serializers/builders';
import { fleetGenerationJobSerializerConfig } from '@serializers/configs';

export const { FleetGenerationJobSerializer } = buildSerializer(
  'server',
  fleetGenerationJobSerializerConfig,
);
