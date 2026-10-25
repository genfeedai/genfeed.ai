import { ingredientGenerationCostAttributes } from '@serializers/attributes/content/ingredient-generation-cost.attributes';
import { simpleConfig } from '@serializers/builders';

export const ingredientGenerationCostSerializerConfig = simpleConfig(
  'ingredient-generation-cost',
  ingredientGenerationCostAttributes,
);
