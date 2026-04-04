import {
  videoAttributes,
  videoCaptionAttributes,
  videoEditAttributes,
} from '../../attributes/ingredients/video.attributes';
import { simpleConfig } from '../../builders';

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
