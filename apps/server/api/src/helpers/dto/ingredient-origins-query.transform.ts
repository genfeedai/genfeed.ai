/**
 * Normalize a repeated `origins` query key (`?origins=UPLOADED&origins=GENERATED`)
 * to an upper-cased array, or `undefined` when none was sent. Validation of each
 * member against `IngredientOrigin` stays on the DTO, so a typo is a 400 rather
 * than an empty Library.
 */
export function normalizeIngredientOrigins(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];

  return values.map((entry) =>
    typeof entry === 'string' ? entry.trim().toUpperCase() : entry,
  );
}
