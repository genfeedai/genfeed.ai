import { buildSerializer } from '@serializers/builders';
import { publicYoutubeOutliersToolSerializerConfig } from '@serializers/configs';

export const { PublicYoutubeOutliersToolSerializer } = buildSerializer(
  'server',
  publicYoutubeOutliersToolSerializerConfig,
);
