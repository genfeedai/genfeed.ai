import { buildSerializer } from '@serializers/builders';
import { videoUpscaleQuoteSerializerConfig } from '@serializers/configs';

export const { VideoUpscaleQuoteSerializer } = buildSerializer(
  'server',
  videoUpscaleQuoteSerializerConfig,
);
