import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { cronRunSerializerConfig } from '../../configs';

export const CronRunSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  cronRunSerializerConfig,
);
