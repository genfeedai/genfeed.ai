import { calendarSlotBulkGenerateAttributes } from '@serializers/attributes/content/calendar-slot-bulk-generate.attributes';
import { simpleConfig } from '@serializers/builders';

export const calendarSlotBulkGenerateSerializerConfig = simpleConfig(
  'calendar-slot-bulk-generate',
  calendarSlotBulkGenerateAttributes,
);
