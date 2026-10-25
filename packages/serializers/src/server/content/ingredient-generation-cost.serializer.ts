import { buildSerializer } from '@serializers/builders';
import { ingredientGenerationCostSerializerConfig } from '@serializers/configs';

export const { IngredientGenerationCostSerializer } = buildSerializer(
  'server',
  ingredientGenerationCostSerializerConfig,
);
