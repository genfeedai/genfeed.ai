import { ingredientExportAttributes } from '@serializers/attributes/organizations/ingredient-export.attributes';
import { simpleConfig } from '@serializers/builders';
export const ingredientExportSerializerConfig = simpleConfig(
  'ingredient-export',
  ingredientExportAttributes,
);
