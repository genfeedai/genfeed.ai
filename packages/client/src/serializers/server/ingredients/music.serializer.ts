import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { musicSerializerConfig } from '../../configs';

const SERVER_MUSIC_ATTRIBUTES = [
  'duration',
  'tempo',
  'key',
  'genre',
  'instrument',
  'mood',
  'bpm',
];

const SERVER_MUSIC_CONFIG = {
  ...musicSerializerConfig,
  attributes: [...musicSerializerConfig.attributes, ...SERVER_MUSIC_ATTRIBUTES],
};

export const MusicSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  SERVER_MUSIC_CONFIG,
);
