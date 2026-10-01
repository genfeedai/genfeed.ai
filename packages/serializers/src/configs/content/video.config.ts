import { generationRequestAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import {
  videoAttributes,
  videoCaptionAttributes,
  videoEditAttributes,
  videoGenerationRequestAttributes,
} from '@serializers/attributes/ingredients/video.attributes';
import { simpleConfig } from '@serializers/builders';
import { EVALUATION_REL } from '@serializers/relationships';

export const videoSerializerConfig = {
  attributes: videoAttributes,
  evaluation: EVALUATION_REL,
  metadata: { type: 'metadata' },
  publications: { type: 'publication' },
  type: 'video',
};

export const videoEditSerializerConfig = simpleConfig(
  'video-edit',
  videoEditAttributes,
  videoGenerationRequestAttributes,
);

export const videoCaptionSerializerConfig = simpleConfig(
  'video-caption',
  videoCaptionAttributes,
);

export const videoGenerationSerializerConfig = {
  ...videoSerializerConfig,
  attributes: [
    ...videoSerializerConfig.attributes,
    ...generationRequestAttributes,
    ...videoGenerationRequestAttributes,
  ],
};
