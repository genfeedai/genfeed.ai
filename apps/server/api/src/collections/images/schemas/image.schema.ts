import {
  Ingredient,
  type IngredientDocument,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';

export class Image extends Ingredient {}

export const ImageSchema = IngredientSchema;

export type ImageDocument = IngredientDocument;
