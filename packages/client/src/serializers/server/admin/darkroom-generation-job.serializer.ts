import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomGenerationJobSerializerConfig } from '../../configs';

export const DarkroomGenerationJobSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomGenerationJobSerializerConfig,
);
