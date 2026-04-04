import { cronRunAttributes } from '@serializers/attributes/automation/cron-run.attributes';
import { simpleConfig } from '@serializers/builders';

export const cronRunSerializerConfig = simpleConfig(
  'cron-run',
  cronRunAttributes,
);
