import { importedSourceMediaAttributes } from '@serializers/attributes/content/imported-source-media.attributes';
import { simpleConfig } from '@serializers/builders';
export const importedSourceMediaSerializerConfig = simpleConfig(
  'imported-source-media',
  importedSourceMediaAttributes,
);
