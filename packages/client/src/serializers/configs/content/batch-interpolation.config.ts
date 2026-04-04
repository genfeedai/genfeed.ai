import { batchInterpolationAttributes } from '../../attributes/content/batch-interpolation.attributes';
import { simpleConfig } from '../../builders';

export const batchInterpolationSerializerConfig = simpleConfig(
  'batch-interpolation',
  batchInterpolationAttributes,
);
