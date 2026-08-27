import { publicYoutubeClipToolAttributes } from '@serializers/attributes/content/public-youtube-clip-tool.attributes';
import { simpleConfig } from '@serializers/builders';

export const publicYoutubeClipToolSerializerConfig = simpleConfig(
  'public-youtube-clip-tool',
  publicYoutubeClipToolAttributes,
);
