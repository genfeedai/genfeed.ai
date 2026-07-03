import { buildSerializer } from '@serializers/builders';
import { recurrenceRuleSerializerConfig } from '@serializers/configs';

export const { RecurrenceRuleSerializer } = buildSerializer(
  'server',
  recurrenceRuleSerializerConfig,
);
