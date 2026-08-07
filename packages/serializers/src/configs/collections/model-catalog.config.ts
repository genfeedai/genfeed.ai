import { modelCatalogAttributes } from '@serializers/attributes/collections/model-catalog.attributes';
import { simpleConfig } from '@serializers/builders';

export const modelCatalogSerializerConfig = simpleConfig(
  'model-catalog',
  modelCatalogAttributes,
);
