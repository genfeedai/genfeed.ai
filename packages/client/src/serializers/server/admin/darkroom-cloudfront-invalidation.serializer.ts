import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomCloudFrontInvalidationSerializerConfig } from '../../configs';

export const DarkroomCloudFrontInvalidationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomCloudFrontInvalidationSerializerConfig,
);
