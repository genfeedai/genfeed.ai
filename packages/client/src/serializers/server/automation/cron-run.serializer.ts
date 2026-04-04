import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { cronRunSerializerConfig } from '../../configs';

export const CronRunSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  cronRunSerializerConfig,
);
