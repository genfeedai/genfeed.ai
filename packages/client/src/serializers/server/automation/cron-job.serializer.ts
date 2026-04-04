import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { cronJobSerializerConfig } from '../../configs';

export const CronJobSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  cronJobSerializerConfig,
);
