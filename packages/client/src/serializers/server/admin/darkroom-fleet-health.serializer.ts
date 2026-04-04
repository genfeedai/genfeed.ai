import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomFleetHealthSerializerConfig } from '../../configs';

export const DarkroomFleetHealthSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomFleetHealthSerializerConfig,
);
