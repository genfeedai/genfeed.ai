import { buildSerializer } from '@serializers/builders';
import { cronJobSerializerConfig } from '@serializers/configs';

export const { CronJobSerializer } = buildSerializer(
  'server',
  cronJobSerializerConfig,
);
