import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { fanvueScheduleSerializerConfig } from '../../configs';

export const FanvueScheduleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueScheduleSerializerConfig,
);
