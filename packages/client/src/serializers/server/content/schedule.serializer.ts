import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { scheduleSerializerConfig } from '../../configs';

export const ScheduleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  scheduleSerializerConfig,
);
