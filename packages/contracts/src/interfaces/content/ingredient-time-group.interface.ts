import type { IIngredient } from '../ingredients/ingredient.interface';

/** One sticky-header bucket of the Library contact sheet. */
export interface IngredientTimeGroup {
  label: string;
  items: IIngredient[];
}
