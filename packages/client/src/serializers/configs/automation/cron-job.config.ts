import { cronJobAttributes } from '../../attributes/automation/cron-job.attributes';
import { simpleConfig } from '../../builders';

export const cronJobSerializerConfig = simpleConfig(
  'cron-job',
  cronJobAttributes,
);
