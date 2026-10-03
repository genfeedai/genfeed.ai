import { buildSerializer } from '@serializers/builders';
import { importedSourceMediaSerializerConfig } from '@serializers/configs/content/imported-source-media.config';
export const { ImportedSourceMediaSerializer } = buildSerializer(
  'server',
  importedSourceMediaSerializerConfig,
);
