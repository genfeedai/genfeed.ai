import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomEc2ActionResultSerializerConfig } from '../../configs';

export const DarkroomEc2ActionResultSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomEc2ActionResultSerializerConfig,
);
