import { buildSerializer } from '@serializers/builders';
import { fanvueContentSerializerConfig } from '@serializers/configs';

export const { FanvueContentSerializer } = buildSerializer(
  'server',
  fanvueContentSerializerConfig,
);
