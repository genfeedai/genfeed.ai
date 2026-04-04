import { darkroomCloudFrontInvalidationAttributes } from '@serializers/attributes/admin/darkroom-cloudfront-invalidation.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomCloudFrontInvalidationSerializerConfig = simpleConfig(
  'darkroom-cloudfront-invalidation',
  darkroomCloudFrontInvalidationAttributes,
);
