import { batchInterpolationAttributes } from '@serializers/attributes/content/batch-interpolation.attributes';
import { simpleConfig } from '@serializers/builders';

export const batchInterpolationSerializerConfig = simpleConfig(
  'batch-interpolation',
  batchInterpolationAttributes,
);
