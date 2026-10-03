import { importedSourceAttributes } from '@serializers/attributes/content/imported-source.attributes';
import { simpleConfig } from '@serializers/builders';
export const importedSourceSerializerConfig = simpleConfig(
  'imported-source',
  importedSourceAttributes,
);
