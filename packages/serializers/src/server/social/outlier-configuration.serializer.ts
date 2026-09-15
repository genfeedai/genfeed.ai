import { buildSerializer } from '@serializers/builders';
import { outlierConfigurationSerializerConfig } from '@serializers/configs/social/outlier-configuration.config';
export const { OutlierConfigurationSerializer } = buildSerializer(
  'server',
  outlierConfigurationSerializerConfig,
);
