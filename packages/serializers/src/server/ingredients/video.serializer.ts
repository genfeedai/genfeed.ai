import { buildSerializer } from '@serializers/builders';
import {
  videoEditSerializerConfig,
  videoSerializerConfig,
} from '@serializers/configs';

const SERVER_VIDEO_ATTRIBUTES = ['frameRate', 'codec', 'bitrate'];

const SERVER_VIDEO_CONFIG = {
  ...videoSerializerConfig,
  attributes: [...videoSerializerConfig.attributes, ...SERVER_VIDEO_ATTRIBUTES],
};

export const { VideoSerializer } = buildSerializer(
  'server',
  SERVER_VIDEO_CONFIG,
);

export const { VideoEditSerializer } = buildSerializer(
  'server',
  videoEditSerializerConfig,
);
