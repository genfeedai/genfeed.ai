/**
 * Library asset origin — where an asset came from, as a permanent fact.
 *
 * Unlike `IngredientStatus` (which moves as an asset renders and is reviewed),
 * origin is decided once at creation and never changes. `UNKNOWN` only exists
 * for legacy rows the backfill could not classify; no creation path sets it.
 *
 * Persisted as the Prisma `IngredientOrigin` enum, so these values equal the
 * Postgres labels exactly. Labels match the Imported / Generated / Knowledge
 * product boundary.
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

/** The origin a copy inherits from its source asset; Unknown when unreadable. */
export function inheritIngredientOrigin(value?: unknown): IngredientOrigin {
  return parseIngredientOrigin(value) ?? IngredientOrigin.UNKNOWN;
}
