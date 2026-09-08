import { buildSerializer } from '@serializers/builders';
import { characterImageInspectionSerializerConfig } from '@serializers/configs';
export const { CharacterImageInspectionSerializer } = buildSerializer(
  'server',
  characterImageInspectionSerializerConfig,
);
