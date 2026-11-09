/**
 * Drops the fields only admin curation sets. `isHighlighted` features a brand
 * on the public community page (#9670), so a member's create or update never
 * carries it; the admin route writes it on its own.
 */
export function withoutCuration<T extends object>(
  dto: T,
): Omit<T, 'isHighlighted'> {
  const { isHighlighted: _isHighlighted, ...fields } = dto as T & {
    isHighlighted?: unknown;
  };
  return fields;
}

/** A brand write that may carry admin curation, as the admin route sends it. */
export type CuratedBrandPatch<T> = Partial<T> & { isHighlighted?: boolean };
