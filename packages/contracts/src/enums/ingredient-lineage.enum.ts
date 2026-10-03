/** Which side of the `sources` / `sourceOf` relation a lineage read follows. */
export enum IngredientLineageDirection {
  /** References used to produce the asset. */
  MADE_FROM = 'made-from',
  /** Assets that used the asset as a reference. */
  USED_IN = 'used-in',
}

/** Lineage strips load one page of this size per direction. */
export const INGREDIENT_LINEAGE_PAGE_SIZE = 24;
