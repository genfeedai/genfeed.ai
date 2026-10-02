import { buildSerializer } from '@serializers/builders';
import { imageSerializerConfig } from '@serializers/configs';
import { imageGenerationSerializerConfig } from '@serializers/configs/ingredients/image.config';

export const { ImageSerializer } = buildSerializer(
  'server',
  imageSerializerConfig,
);

export const { ImageSerializer: ImageGenerationSerializer } = buildSerializer(
  'server',
  imageGenerationSerializerConfig,
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

export const { ImageEditingRequestSerializer } = buildSerializer('server', {
  type: 'image-editing-request',
  attributes: [
    'prompt',
    'brand',
    'model',
    'references',
    'maskId',
    'resolution',
    'aspectRatio',
    'size',
    'outputs',
    'seed',
    'sourceActionId',
    'waitForCompletion',
  ],
});
