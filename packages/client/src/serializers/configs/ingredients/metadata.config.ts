import { metadataAttributes } from '../../attributes/ingredients/metadata.attributes';
import { simpleConfig } from '../../builders';

export const metadataSerializerConfig = simpleConfig(
  'metadata',
  metadataAttributes,
);
