import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import {
  ingredientBulkDeleteSerializerConfig,
  ingredientMergeSerializerConfig,
  ingredientSerializerConfig,
  ingredientUploadSerializerConfig,
} from '../../configs';

export const IngredientSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  ingredientSerializerConfig,
);

export const IngredientBulkDeleteSerializer: BuiltSerializer =
  buildSingleSerializer('server', ingredientBulkDeleteSerializerConfig);

export const IngredientMergeSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  ingredientMergeSerializerConfig,
);

export const IngredientUploadSerializer: BuiltSerializer =
  buildSingleSerializer('server', ingredientUploadSerializerConfig);
