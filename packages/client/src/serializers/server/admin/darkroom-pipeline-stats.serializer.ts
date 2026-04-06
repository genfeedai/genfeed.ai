import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomPipelineStatsSerializerConfig } from '../../configs';

export const DarkroomPipelineStatsSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomPipelineStatsSerializerConfig);
