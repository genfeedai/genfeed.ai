import { publicYoutubeOutliersToolAttributes } from '@serializers/attributes/content/public-youtube-outliers-tool.attributes';
import { simpleConfig } from '@serializers/builders';

export const publicYoutubeOutliersToolSerializerConfig = simpleConfig(
  'public-youtube-outliers-tool',
  publicYoutubeOutliersToolAttributes,
);
