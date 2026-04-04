import {
  videoAttributes,
  videoCaptionAttributes,
  videoEditAttributes,
} from '@serializers/attributes/ingredients/video.attributes';
import { simpleConfig } from '@serializers/builders';

export const videoSerializerConfig = {
  attributes: videoAttributes,
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
