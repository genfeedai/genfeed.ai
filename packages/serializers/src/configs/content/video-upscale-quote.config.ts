import { videoUpscaleQuoteAttributes } from '@serializers/attributes/content/video-upscale-quote.attributes';
import { simpleConfig } from '@serializers/builders';

export const videoUpscaleQuoteSerializerConfig = simpleConfig(
  'video-upscale-quote',
  videoUpscaleQuoteAttributes,
);
