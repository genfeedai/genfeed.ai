/** Upper bound on `characters` ids in one Library query. */
export const MAX_CHARACTER_FILTER_IDS = 25;

/**
 * Normalize a repeated `characters` query key (`?characters=a&characters=b`) to
 * a trimmed, de-duplicated array of ids, or `undefined` when none was sent.
 * Each member is validated as an entity id on the DTO, so a malformed id is a
 * 400 rather than an empty Library.
 */
export function normalizeIngredientCharacterIds(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const trimmed = values.map((entry) =>
    typeof entry === 'string' ? entry.trim() : entry,
  );

  return Array.from(new Set(trimmed));
}
