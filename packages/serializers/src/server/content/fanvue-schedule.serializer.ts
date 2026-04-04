import { buildSerializer } from '@serializers/builders';
import { fanvueScheduleSerializerConfig } from '@serializers/configs';

export const { FanvueScheduleSerializer } = buildSerializer(
  'server',
  fanvueScheduleSerializerConfig,
);
