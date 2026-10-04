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

/**
 * Origins that make an asset a *reference* — material brought in to generate
 * from, not output. The Library keeps them on the References shelf, out of
 * All assets and Unsorted.
 */
export const LIBRARY_REFERENCE_ORIGINS: readonly IngredientOrigin[] = [
  IngredientOrigin.UPLOADED,
  IngredientOrigin.IMPORTED,
] as const;

/** Origins All assets shows by default: everything that is not a reference. */
export const LIBRARY_OUTPUT_ORIGINS: readonly IngredientOrigin[] =
  INGREDIENT_ORIGIN_ORDER.filter(
    (origin) => !LIBRARY_REFERENCE_ORIGINS.includes(origin),
  );

/** Whether an asset's origin makes it a reference rather than output. */
export function isLibraryReferenceOrigin(value?: unknown): boolean {
  const origin = parseIngredientOrigin(value);

  return origin ? LIBRARY_REFERENCE_ORIGINS.includes(origin) : false;
}

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
