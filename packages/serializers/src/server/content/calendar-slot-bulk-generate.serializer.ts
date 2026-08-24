import { buildSerializer } from '@serializers/builders';
import { calendarSlotBulkGenerateSerializerConfig } from '@serializers/configs';

export const { CalendarSlotBulkGenerateSerializer } = buildSerializer(
  'server',
  calendarSlotBulkGenerateSerializerConfig,
);
