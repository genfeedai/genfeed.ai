import type { IngredientFormat } from '@genfeedai/enums';

export interface IImageMergeParams {
  ids: string[];
  model?: string;
  prompt?: string;
  format?: IngredientFormat;
  category?: string;
}
