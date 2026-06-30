import { fleetPipelineStatsAttributes } from '@serializers/attributes/admin/fleet-pipeline-stats.attributes';
import { simpleConfig } from '@serializers/builders';

export const fleetPipelineStatsSerializerConfig = simpleConfig(
  'fleet-pipeline-stats',
  fleetPipelineStatsAttributes,
);
