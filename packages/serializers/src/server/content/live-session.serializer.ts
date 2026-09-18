import { buildSerializer } from '@serializers/builders';
import { liveSessionSerializerConfig } from '@serializers/configs';

export const { LiveSessionSerializer } = buildSerializer(
  'server',
  liveSessionSerializerConfig,
);
