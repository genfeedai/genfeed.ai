/** Upper bound on `characters` ids in one Library query. */
export const MAX_CHARACTER_FILTER_IDS = 25;

/**
 * Normalize a repeated `characters` query key (`?characters=a&characters=b`) to
 * a trimmed, de-duplicated array of ids, or `undefined` when the key is absent.
 * An empty value stays in the array so the entity-id validator rejects it; it
 * must never silently become an unfiltered list.
 * Each member is validated as an entity id on the DTO, so a malformed id is a
 * 400 rather than an empty Library.
 */
export function normalizeIngredientCharacterIds(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const trimmed = values.map((entry) =>
    typeof entry === 'string' ? entry.trim() : entry,
  );

  return Array.from(new Set(trimmed));
}
