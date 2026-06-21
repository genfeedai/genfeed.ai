import type { IIngredient } from '@genfeedai/interfaces';

export interface UseBrandMediaAssetsResult {
  assets: IIngredient[];
  isLoading: boolean;
  error: Error | null;
  /** True when the safety cap was hit and not all assets are shown. */
  isTruncated: boolean;
  refresh: () => void;
}
