import { buildSerializer } from '@serializers/builders';
import { contentScheduleSerializerConfig } from '@serializers/configs';

export const { ContentScheduleSerializer } = buildSerializer(
  'server',
  contentScheduleSerializerConfig,
);
