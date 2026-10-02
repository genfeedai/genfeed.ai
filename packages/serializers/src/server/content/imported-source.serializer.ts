import { buildSerializer } from '@serializers/builders';
import { importedSourceSerializerConfig } from '@serializers/configs/content/imported-source.config';
export const { ImportedSourceSerializer } = buildSerializer(
  'server',
  importedSourceSerializerConfig,
);
