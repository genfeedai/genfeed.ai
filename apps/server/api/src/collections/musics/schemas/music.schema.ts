import {
  Ingredient,
  type IngredientDocument,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';

export class Music extends Ingredient {}
export const MusicSchema = IngredientSchema;
export type MusicDocument = IngredientDocument;
