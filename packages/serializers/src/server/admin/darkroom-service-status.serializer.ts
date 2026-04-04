import { buildSerializer } from '@serializers/builders';
import { darkroomServiceStatusSerializerConfig } from '@serializers/configs';

export const { DarkroomServiceStatusSerializer } = buildSerializer(
  'server',
  darkroomServiceStatusSerializerConfig,
);
