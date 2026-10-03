/**
 * Library asset origin — where an asset came from, as a permanent fact.
 *
 * Unlike `IngredientStatus` (which moves as an asset renders and is reviewed),
 * origin is decided once at creation and never changes. `UNKNOWN` only exists
 * for legacy rows the backfill could not classify; no creation path sets it.
 *
 * Labels match the Imported / Generated / Knowledge product boundary.
 */
export enum IngredientOrigin {
  UPLOADED = 'UPLOADED',
  GENERATED = 'GENERATED',
  IMPORTED = 'IMPORTED',
  UNKNOWN = 'UNKNOWN',
}

/** Display order of origins in the Library origin filter. */
export const INGREDIENT_ORIGIN_ORDER: readonly IngredientOrigin[] = [
  IngredientOrigin.UPLOADED,
  IngredientOrigin.GENERATED,
  IngredientOrigin.IMPORTED,
  IngredientOrigin.UNKNOWN,
] as const;

/** Human labels for each origin. Text, never color alone. */
export const INGREDIENT_ORIGIN_LABELS: Record<IngredientOrigin, string> = {
  [IngredientOrigin.UPLOADED]: 'Uploaded',
  [IngredientOrigin.GENERATED]: 'Generated',
  [IngredientOrigin.IMPORTED]: 'Imported',
  [IngredientOrigin.UNKNOWN]: 'Unknown',
};

/** Which side of the `sources` / `sourceOf` relation a lineage read follows. */
export enum IngredientLineageDirection {
  /** References used to produce the asset. */
  MADE_FROM = 'made-from',
  /** Assets that used the asset as a reference. */
  USED_IN = 'used-in',
}

/** Lineage strips load one page of this size per direction. */
export const INGREDIENT_LINEAGE_PAGE_SIZE = 24;

/** Narrow an arbitrary string to an `IngredientOrigin`, or `undefined`. */
export function parseIngredientOrigin(
  value?: unknown,
): IngredientOrigin | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  return INGREDIENT_ORIGIN_ORDER.find((origin) => origin === normalized);
}
