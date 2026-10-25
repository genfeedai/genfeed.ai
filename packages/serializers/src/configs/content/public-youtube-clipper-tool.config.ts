import { publicYoutubeClipperToolAttributes } from '@serializers/attributes/content/public-youtube-clipper-tool.attributes';
import { simpleConfig } from '@serializers/builders';

export const publicYoutubeClipperToolSerializerConfig = simpleConfig(
  'public-youtube-clipper-tool',
  publicYoutubeClipperToolAttributes,
);
