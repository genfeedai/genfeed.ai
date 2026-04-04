import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { simpleConfig } from '@serializers/builders';

export const metadataSerializerConfig = simpleConfig(
  'metadata',
  metadataAttributes,
);
