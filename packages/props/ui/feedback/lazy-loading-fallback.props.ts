import type { IngredientFormat } from '@genfeedai/enums';

export interface LazyLoadingFallbackProps {
  variant?: string;
  aspectRatio?: IngredientFormat;
  isSpinnerEnabled?: boolean;
  className?: string;
}
