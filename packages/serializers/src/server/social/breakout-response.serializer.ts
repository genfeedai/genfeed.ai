import { buildSerializer } from '@serializers/builders';
import { breakoutResponseSerializerConfig } from '@serializers/configs/social/breakout-response.config';
export const { BreakoutResponseSerializer } = buildSerializer(
  'server',
  breakoutResponseSerializerConfig,
);
