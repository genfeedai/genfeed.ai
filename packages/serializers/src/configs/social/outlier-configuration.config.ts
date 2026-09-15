import { outlierConfigurationAttributes } from '@serializers/attributes/social/outlier-configuration.attributes';
import { simpleConfig } from '@serializers/builders';
export const outlierConfigurationSerializerConfig = simpleConfig(
  'outlier-configuration',
  outlierConfigurationAttributes,
);
