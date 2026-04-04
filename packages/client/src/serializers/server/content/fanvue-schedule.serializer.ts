import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { fanvueScheduleSerializerConfig } from '../../configs';

export const FanvueScheduleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueScheduleSerializerConfig,
);
