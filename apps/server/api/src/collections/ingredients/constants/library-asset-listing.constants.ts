import {
  INGREDIENT_UNUSABLE_STATUSES,
  type IngredientStatus,
} from '@genfeedai/contracts';

/** Lifecycle states the Library lists hide by default. */
export const HIDDEN_LIBRARY_ASSET_STATUSES: readonly IngredientStatus[] =
  INGREDIENT_UNUSABLE_STATUSES;
