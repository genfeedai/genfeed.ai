/** Upper bound on `tags` ids in one Library query. */
export const MAX_TAG_FILTER_IDS = 25;

/**
 * Normalize a repeated `tags` query key (`?tags=a&tags=b`) to a trimmed,
 * de-duplicated array of ids, or `undefined` when the key is absent. An empty
 * value stays in the array so the entity-id validator rejects it; it must
 * never silently become an unfiltered list. Each member is validated as an
 * entity id on the DTO, so a malformed id is a 400 rather than an empty
 * Library.
 */
export function normalizeIngredientTagIds(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const trimmed = values.map((entry) =>
    typeof entry === 'string' ? entry.trim() : entry,
  );

  return Array.from(new Set(trimmed));
}

/**
 * Normalize the `tagMatch` query key to lower case. Validation against
 * `TagMatchMode` stays on the DTO, so a typo is a 400 rather than a silently
 * different filter.
 */
export function normalizeTagMatchMode(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
