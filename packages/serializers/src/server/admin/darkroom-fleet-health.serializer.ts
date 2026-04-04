import { buildSerializer } from '@serializers/builders';
import { darkroomFleetHealthSerializerConfig } from '@serializers/configs';

export const { DarkroomFleetHealthSerializer } = buildSerializer(
  'server',
  darkroomFleetHealthSerializerConfig,
);
