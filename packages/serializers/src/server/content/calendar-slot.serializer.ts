import { buildSerializer } from '@serializers/builders';
import { calendarSlotSerializerConfig } from '@serializers/configs';

export const { CalendarSlotSerializer } = buildSerializer(
  'server',
  calendarSlotSerializerConfig,
);
