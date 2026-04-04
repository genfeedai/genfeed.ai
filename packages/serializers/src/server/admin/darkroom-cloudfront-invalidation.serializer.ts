import { buildSerializer } from '@serializers/builders';
import { darkroomCloudFrontInvalidationSerializerConfig } from '@serializers/configs';

export const { DarkroomCloudFrontInvalidationSerializer } = buildSerializer(
  'server',
  darkroomCloudFrontInvalidationSerializerConfig,
);
