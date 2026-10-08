import { breakoutResponseAttributes } from '@serializers/attributes/social/breakout-response.attributes';
import { simpleConfig } from '@serializers/builders';
export const breakoutResponseSerializerConfig = simpleConfig(
  'breakout-response',
  breakoutResponseAttributes,
);
