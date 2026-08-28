import { buildSerializer } from '@serializers/builders';
import { publicYoutubeLongFormToolSerializerConfig } from '@serializers/configs';

export const { PublicYoutubeLongFormToolSerializer } = buildSerializer(
  'server',
  publicYoutubeLongFormToolSerializerConfig,
);
