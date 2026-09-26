import { generationRequestAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { buildSerializer } from '@serializers/builders';
import { imageSerializerConfig } from '@serializers/configs';

export const { ImageSerializer } = buildSerializer(
  'server',
  imageSerializerConfig,
);

export const { ImageSerializer: ImageGenerationSerializer } = buildSerializer(
  'server',
  {
    ...imageSerializerConfig,
    attributes: [
      ...imageSerializerConfig.attributes,
      ...generationRequestAttributes,
    ],
  },
);

const IMAGE_EDIT_CONFIG = {
  attributes: [
    'width',
    'height',
    'model',
    'text',
    'metadata',
    'enhanceModel',
    'outputFormat',
    'upscaleFactor',
    'faceEnhancement',
    'subjectDetection',
    'faceEnhancementStrength',
    'faceEnhancementCreativity',
    'outputs',
    'brand',
    'organization',
  ],
  type: 'image-edit',
};

export const { ImageEditSerializer } = buildSerializer(
  'server',
  IMAGE_EDIT_CONFIG,
);
