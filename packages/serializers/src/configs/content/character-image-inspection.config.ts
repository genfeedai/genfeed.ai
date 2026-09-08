import { characterImageInspectionAttributes } from '@serializers/attributes/content/character-image-inspection.attributes';
import { simpleConfig } from '@serializers/builders';
export const characterImageInspectionSerializerConfig = simpleConfig(
  'character-image-inspection',
  characterImageInspectionAttributes,
);
