import { cronJobAttributes } from '@serializers/attributes/automation/cron-job.attributes';
import { simpleConfig } from '@serializers/builders';

export const cronJobSerializerConfig = simpleConfig(
  'cron-job',
  cronJobAttributes,
);
