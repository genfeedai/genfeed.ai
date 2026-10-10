import { buildSerializer } from '@serializers/builders';
import { turboProjectSerializerConfig } from '@serializers/configs';

export const { TurboProjectSerializer } = buildSerializer(
  'server',
  turboProjectSerializerConfig,
);
