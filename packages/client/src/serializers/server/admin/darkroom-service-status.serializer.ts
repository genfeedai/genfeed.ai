import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomServiceStatusSerializerConfig } from '../../configs';

export const DarkroomServiceStatusSerializer: BuiltSerializer =
  buildSingleSerializer('server', darkroomServiceStatusSerializerConfig);
