import { cronRunAttributes } from '../../attributes/automation/cron-run.attributes';
import { simpleConfig } from '../../builders';

export const cronRunSerializerConfig = simpleConfig(
  'cron-run',
  cronRunAttributes,
);
