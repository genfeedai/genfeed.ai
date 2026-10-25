import { buildSerializer } from '@serializers/builders';
import { publicYoutubeClipperToolSerializerConfig } from '@serializers/configs';

export const { PublicYoutubeClipperToolSerializer } = buildSerializer(
  'server',
  publicYoutubeClipperToolSerializerConfig,
);
