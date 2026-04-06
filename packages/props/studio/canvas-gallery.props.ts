import type { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';

export interface CanvasGalleryProps {
  categoryType: IngredientCategory;
  onAssetSelect?: (ingredient: IIngredient | null) => void;
  onReferencesSelect?: (references: IIngredient[]) => void;
  selectedAssetId?: string;
  scrollFocusedIngredientId?: string | null;
  currentFormat?: { width: number; height: number } | null;
  generatedAssetId?: string | null;
}
