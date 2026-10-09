import {
  imageAttributes,
  imageGenerationRequestAttributes,
} from '@serializers/attributes/ingredients/image.attributes';
import { generationRequestAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { rel, simpleConfig } from '@serializers/builders';
import { serializeGenerationEntry } from '@serializers/helpers/generation-entry.helper';
import { serializeImageEdit } from '@serializers/helpers/image-edit.helper';

export const imageSerializerConfig = {
  ...simpleConfig('image', imageAttributes),
  attributeDerivations: {
    generationEntry: serializeGenerationEntry,
    imageEdit: serializeImageEdit,
  },
  metadata: rel('metadata', metadataAttributes),
};

export const imageGenerationSerializerConfig = {
  ...imageSerializerConfig,
  attributes: [
    ...imageSerializerConfig.attributes,
    ...generationRequestAttributes,
    ...imageGenerationRequestAttributes,
    'resolution',
    'aspectRatio',
  ],
};
