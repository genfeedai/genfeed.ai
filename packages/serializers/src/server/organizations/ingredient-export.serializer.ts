import { buildSerializer } from '@serializers/builders';
import { ingredientExportSerializerConfig } from '@serializers/configs/organizations/ingredient-export.config';
export const { IngredientExportSerializer } = buildSerializer(
  'server',
  ingredientExportSerializerConfig,
);
