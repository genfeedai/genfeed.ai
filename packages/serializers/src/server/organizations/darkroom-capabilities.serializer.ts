import { buildSerializer } from '@serializers/builders';
import { darkroomCapabilitiesSerializerConfig } from '@serializers/configs/organizations/darkroom-capabilities.config';

export const { DarkroomCapabilitiesSerializer } = buildSerializer(
  'server',
  darkroomCapabilitiesSerializerConfig,
);
