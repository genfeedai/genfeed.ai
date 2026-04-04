import { buildSerializer } from '@serializers/builders';
import { darkroomEc2InstanceSerializerConfig } from '@serializers/configs';

export const { DarkroomEc2InstanceSerializer } = buildSerializer(
  'server',
  darkroomEc2InstanceSerializerConfig,
);
