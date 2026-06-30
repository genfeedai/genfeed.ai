import { buildSerializer } from '@serializers/builders';
import { warmupAccountSerializerConfig } from '@serializers/configs';

export const { WarmupAccountSerializer } = buildSerializer(
  'server',
  warmupAccountSerializerConfig,
);
