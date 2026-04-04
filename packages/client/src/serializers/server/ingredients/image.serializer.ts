import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { imageSerializerConfig } from '../../configs';

export const ImageSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  imageSerializerConfig,
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

export const ImageEditSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  IMAGE_EDIT_CONFIG,
);
