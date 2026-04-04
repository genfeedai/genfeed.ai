import { buildSerializer } from '@serializers/builders';
import { darkroomEc2ActionResultSerializerConfig } from '@serializers/configs';

export const { DarkroomEc2ActionResultSerializer } = buildSerializer(
  'server',
  darkroomEc2ActionResultSerializerConfig,
);
