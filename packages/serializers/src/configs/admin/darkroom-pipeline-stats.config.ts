import { darkroomPipelineStatsAttributes } from '@serializers/attributes/admin/darkroom-pipeline-stats.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomPipelineStatsSerializerConfig = simpleConfig(
  'darkroom-pipeline-stats',
  darkroomPipelineStatsAttributes,
);
