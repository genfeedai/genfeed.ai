import { buildSerializer } from '@serializers/builders';
import { cronRunSerializerConfig } from '@serializers/configs';

export const { CronRunSerializer } = buildSerializer(
  'server',
  cronRunSerializerConfig,
);
