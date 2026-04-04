import { buildSerializer } from '@serializers/builders';
import {
  ingredientBulkDeleteSerializerConfig,
  ingredientMergeSerializerConfig,
  ingredientSerializerConfig,
  ingredientUploadSerializerConfig,
} from '@serializers/configs';

export const { IngredientSerializer } = buildSerializer(
  'server',
  ingredientSerializerConfig,
);

export const { IngredientBulkDeleteSerializer } = buildSerializer(
  'server',
  ingredientBulkDeleteSerializerConfig,
);

export const { IngredientMergeSerializer } = buildSerializer(
  'server',
  ingredientMergeSerializerConfig,
);

export const { IngredientUploadSerializer } = buildSerializer(
  'server',
  ingredientUploadSerializerConfig,
);
