import { buildSerializer } from '@serializers/builders';
import { creativePatternSerializerConfig } from '@serializers/configs';

export const { CreativePatternSerializer } = buildSerializer(
  'server',
  creativePatternSerializerConfig,
);
