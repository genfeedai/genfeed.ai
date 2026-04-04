import { buildSerializer } from '@serializers/builders';
import { scheduleSerializerConfig } from '@serializers/configs';

export const { ScheduleSerializer } = buildSerializer(
  'server',
  scheduleSerializerConfig,
);
