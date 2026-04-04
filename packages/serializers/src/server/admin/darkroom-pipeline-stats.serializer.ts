import { buildSerializer } from '@serializers/builders';
import { darkroomPipelineStatsSerializerConfig } from '@serializers/configs';

export const { DarkroomPipelineStatsSerializer } = buildSerializer(
  'server',
  darkroomPipelineStatsSerializerConfig,
);
