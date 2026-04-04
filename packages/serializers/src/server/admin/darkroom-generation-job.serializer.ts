import { buildSerializer } from '@serializers/builders';
import { darkroomGenerationJobSerializerConfig } from '@serializers/configs';

export const { DarkroomGenerationJobSerializer } = buildSerializer(
  'server',
  darkroomGenerationJobSerializerConfig,
);
