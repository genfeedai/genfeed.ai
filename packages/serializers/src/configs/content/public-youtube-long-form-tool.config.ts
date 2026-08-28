import { publicYoutubeLongFormToolAttributes } from '@serializers/attributes/content/public-youtube-long-form-tool.attributes';
import { simpleConfig } from '@serializers/builders';

export const publicYoutubeLongFormToolSerializerConfig = simpleConfig(
  'public-youtube-long-form-tool',
  publicYoutubeLongFormToolAttributes,
);
