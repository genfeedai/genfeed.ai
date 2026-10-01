import {
  imageAttributes,
  imageGenerationRequestAttributes,
} from '@serializers/attributes/ingredients/image.attributes';
import { generationRequestAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { simpleConfig } from '@serializers/builders';

export const imageSerializerConfig = simpleConfig('image', imageAttributes);

export const imageGenerationSerializerConfig = {
  ...imageSerializerConfig,
  attributes: [
    ...imageSerializerConfig.attributes,
    ...generationRequestAttributes,
    ...imageGenerationRequestAttributes,
  ],
};
