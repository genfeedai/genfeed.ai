import { buildSerializer } from '@serializers/builders';
import { turboRunSerializerConfig } from '@serializers/configs';

export const { TurboRunSerializer } = buildSerializer(
  'server',
  turboRunSerializerConfig,
);
