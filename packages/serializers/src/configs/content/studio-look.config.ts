import { studioLookAttributes } from '@serializers/attributes/content/studio-look.attributes';
import { simpleConfig } from '@serializers/builders';

export const studioLookSerializerConfig = simpleConfig(
  'studio-look',
  studioLookAttributes,
);
