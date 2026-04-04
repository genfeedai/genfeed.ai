import {
  Ingredient,
  type IngredientDocument,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';

export class GIF extends Ingredient {}

export const GIFSchema = IngredientSchema;

export type GIFDocument = IngredientDocument;
