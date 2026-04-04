import { buildSerializer } from '@serializers/builders';
import { musicSerializerConfig } from '@serializers/configs';

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

export const { MusicSerializer } = buildSerializer(
  'server',
  SERVER_MUSIC_CONFIG,
);
