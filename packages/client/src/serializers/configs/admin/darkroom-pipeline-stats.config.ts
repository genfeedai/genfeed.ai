import { darkroomPipelineStatsAttributes } from '../../attributes/admin/darkroom-pipeline-stats.attributes';
import { simpleConfig } from '../../builders';

export const darkroomPipelineStatsSerializerConfig = simpleConfig(
  'darkroom-pipeline-stats',
  darkroomPipelineStatsAttributes,
);
