import { darkroomCapabilitiesAttributes } from '@serializers/attributes/organizations/darkroom-capabilities.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomCapabilitiesSerializerConfig = simpleConfig(
  'darkroom-capabilities',
  darkroomCapabilitiesAttributes,
);
