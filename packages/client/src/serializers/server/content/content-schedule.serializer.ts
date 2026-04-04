import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contentScheduleSerializerConfig } from '../../configs';

export const ContentScheduleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentScheduleSerializerConfig,
);
