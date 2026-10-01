import {
  videoAttributes,
  videoCaptionAttributes,
  videoEditAttributes,
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
);

export const videoCaptionSerializerConfig = simpleConfig(
  'video-caption',
  videoCaptionAttributes,
);
