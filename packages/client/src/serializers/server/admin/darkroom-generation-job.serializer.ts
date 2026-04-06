import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomGenerationJobSerializerConfig } from '../../configs';

export const DarkroomGenerationJobSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomGenerationJobSerializerConfig);
