import type { IngredientFormat } from '@genfeedai/contracts';

export interface LazyLoadingFallbackProps {
  variant?: string;
  aspectRatio?: IngredientFormat;
  isSpinnerEnabled?: boolean;
  className?: string;
}
