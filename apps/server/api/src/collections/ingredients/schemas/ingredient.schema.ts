import type { AssetScope } from '@genfeedai/enums';
import type { Ingredient } from '@genfeedai/prisma';

export type { Ingredient } from '@genfeedai/prisma';

export interface IngredientRefDocument {
  _id?: string;
  clerkId?: string | null;
  id?: string;
  [key: string]: unknown;
}

export interface IngredientMetadataDocument extends IngredientRefDocument {
  duration?: number;
  extension?: string;
  height?: number;
  model?: string;
  prompt?: string;
  result?: string;
  size?: number;
  style?: string;
  width?: number;
}

export interface IngredientDocument extends Omit<Ingredient, 'scope'> {
  _id: string;
  brand?: string | IngredientRefDocument | null;
  content?: string;
  metadata?: IngredientMetadataDocument | null;
  organization?: string | IngredientRefDocument | null;
  scope?: AssetScope | null;
  title?: string;
  user?: string | IngredientRefDocument | null;
  [key: string]: unknown;
}
