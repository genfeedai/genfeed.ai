import {
  Ingredient,
  type IngredientDocument,
  IngredientSchema,
} from '@api/collections/ingredients/schemas/ingredient.schema';

export class Avatar extends Ingredient {}

export const AvatarSchema = IngredientSchema;

export type AvatarDocument = IngredientDocument;
