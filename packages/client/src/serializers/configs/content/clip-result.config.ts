import { clipResultAttributes } from '../../attributes/content/clip-result.attributes';
import { simpleConfig } from '../../builders';

export const clipResultSerializerConfig = simpleConfig(
  'clip-result',
  clipResultAttributes,
);
