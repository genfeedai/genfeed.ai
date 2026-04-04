import { buildSerializer } from '@serializers/builders';
import { captionSerializerConfig } from '@serializers/configs';

export const { CaptionSerializer } = buildSerializer(
  'server',
  captionSerializerConfig,
);
