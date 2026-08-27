import { buildSerializer } from '@serializers/builders';
import { publicYoutubeClipToolSerializerConfig } from '@serializers/configs';

export const { PublicYoutubeClipToolSerializer } = buildSerializer(
  'server',
  publicYoutubeClipToolSerializerConfig,
);
