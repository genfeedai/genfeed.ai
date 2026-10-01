import { buildSerializer } from '@serializers/builders';
import {
  videoCaptionSerializerConfig,
  videoEditSerializerConfig,
  videoSerializerConfig,
} from '@serializers/configs';

import { videoGenerationSerializerConfig } from '@serializers/configs/content/video.config';

const SERVER_VIDEO_ATTRIBUTES = ['frameRate', 'codec', 'bitrate'];

const SERVER_VIDEO_CONFIG = {
  ...videoSerializerConfig,
  attributes: [...videoSerializerConfig.attributes, ...SERVER_VIDEO_ATTRIBUTES],
};

export const { VideoSerializer } = buildSerializer(
  'server',
  SERVER_VIDEO_CONFIG,
);

export const { VideoSerializer: VideoGenerationSerializer } = buildSerializer(
  'server',
  {
    ...videoGenerationSerializerConfig,
    attributes: [
      ...videoGenerationSerializerConfig.attributes,
      ...SERVER_VIDEO_ATTRIBUTES,
    ],
  },
);

export const { VideoEditSerializer } = buildSerializer(
  'server',
  videoEditSerializerConfig,
);

export const { VideoCaptionSerializer } = buildSerializer(
  'server',
  videoCaptionSerializerConfig,
);
