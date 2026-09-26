import { mediaPerceptionAttributes } from '@serializers/attributes/content/media-perception.attributes';
import { simpleConfig } from '@serializers/builders';

export const mediaPerceptionSerializerConfig = simpleConfig(
  'media-perception',
  mediaPerceptionAttributes,
);
