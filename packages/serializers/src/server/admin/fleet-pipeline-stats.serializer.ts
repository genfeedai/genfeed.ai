import { buildSerializer } from '@serializers/builders';
import { fleetPipelineStatsSerializerConfig } from '@serializers/configs';

export const { FleetPipelineStatsSerializer } = buildSerializer(
  'server',
  fleetPipelineStatsSerializerConfig,
);
