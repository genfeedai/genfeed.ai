import { clipResultAttributes } from '@serializers/attributes/content/clip-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const clipResultSerializerConfig = simpleConfig(
  'clip-result',
  clipResultAttributes,
);
