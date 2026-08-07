import { buildSerializer } from '@serializers/builders';
import { modelCatalogSerializerConfig } from '@serializers/configs';

export const { ModelCatalogSerializer } = buildSerializer(
  'server',
  modelCatalogSerializerConfig,
);
