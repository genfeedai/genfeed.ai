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
  externalId?: string;
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

/**
 * Prisma is canonical for every persisted field on this row shape, `scope`
 * included. The domain `AssetScope` from `@genfeedai/enums` is a nominal TS
 * enum, so using it here made `IngredientEntity` (all-Prisma) unassignable to
 * `IngredientDocument` even though both carry the identical SCREAMING_SNAKE
 * labels. `Ingredient['scope']` keeps the two sides one type; app-facing
 * values cross the boundary through `CategoryPrismaUtil.toAssetScope()`.
 * Only the optionality is widened — documents are routinely partial rows.
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export interface IngredientDocument extends Omit<Ingredient, 'scope'> {
  brand?: IngredientRefDocument | null;
  metadata?: IngredientMetadataDocument | null;
  organization?: IngredientRefDocument | null;
  prompt?: IngredientRefDocument | null;
  scope?: Ingredient['scope'] | null;
  user?: IngredientRefDocument | null;
  [key: string]: unknown;
}
