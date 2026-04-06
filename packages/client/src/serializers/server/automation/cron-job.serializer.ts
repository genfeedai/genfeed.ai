import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { cronJobSerializerConfig } from '../../configs';

export const CronJobSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  cronJobSerializerConfig,
);
