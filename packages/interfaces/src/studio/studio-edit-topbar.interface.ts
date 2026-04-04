import type { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '../index';

export interface StudioEditTopbarProps {
  categoryType: IngredientCategory;
  onIngredientCategoryChange: (category: IngredientCategory) => void;
  isProcessing: boolean;
  assets: IIngredient[];
  selectedIngredient: IIngredient | null;
  onAssetDeselect: () => void;
}
