import type { IngredientFormat } from '../..';

export interface IImageMergeParams {
  ids: string[];
  model?: string;
  prompt?: string;
  format?: IngredientFormat;
  category?: string;
}
