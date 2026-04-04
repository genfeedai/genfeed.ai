import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomServiceStatusSerializerConfig } from '../../configs';

export const DarkroomServiceStatusSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomServiceStatusSerializerConfig,
);
