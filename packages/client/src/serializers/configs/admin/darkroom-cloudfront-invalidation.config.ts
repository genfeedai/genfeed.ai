import { darkroomCloudFrontInvalidationAttributes } from '../../attributes/admin/darkroom-cloudfront-invalidation.attributes';
import { simpleConfig } from '../../builders';

export const darkroomCloudFrontInvalidationSerializerConfig = simpleConfig(
  'darkroom-cloudfront-invalidation',
  darkroomCloudFrontInvalidationAttributes,
);
