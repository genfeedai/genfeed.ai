import type { AssetScope } from '@genfeedai/enums';
import type { Ingredient } from '@genfeedai/prisma';

export type { Ingredient } from '@genfeedai/prisma';

export interface IngredientRefDocument {
  description?: string;
  id: string;
  label?: string;
  name?: string;
  original?: string;
  [key: string]: unknown;
}

export interface IngredientMetadataDocument {
  id?: string;
  duration?: number;
  extension?: string;
  externalProvider?: string;
  height?: number;
  model?: string;
  promptId?: string | null;
  result?: string;
  size?: number;
  style?: string;
  width?: number;
  [key: string]: unknown;
}

export interface IngredientDocument extends Omit<Ingredient, 'scope'> {
  brand?: IngredientRefDocument | null;
  metadata?: IngredientMetadataDocument | null;
  organization?: IngredientRefDocument | null;
  prompt?: IngredientRefDocument | null;
  scope?: AssetScope | null;
  user?: IngredientRefDocument | null;
  [key: string]: unknown;
}
