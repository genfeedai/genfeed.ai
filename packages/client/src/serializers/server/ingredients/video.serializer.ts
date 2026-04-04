import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import {
  videoEditSerializerConfig,
  videoSerializerConfig,
} from '../../configs';

const SERVER_VIDEO_ATTRIBUTES = ['frameRate', 'codec', 'bitrate'];

const SERVER_VIDEO_CONFIG = {
  ...videoSerializerConfig,
  attributes: [...videoSerializerConfig.attributes, ...SERVER_VIDEO_ATTRIBUTES],
};

export const VideoSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  SERVER_VIDEO_CONFIG,
);

export const VideoEditSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  videoEditSerializerConfig,
);
