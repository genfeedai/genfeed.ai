/** Where the admin list search looks: real columns and keys inside a JSON column. */
export interface SearchWhereFields {
  /** Text columns matched with a case-insensitive `contains`. */
  columns?: string[];
  /** JSON columns, each with the keys inside it that hold searchable text. */
  json?: Record<string, string[]>;
  /** To-one relations, each with the text columns of the related row. */
  relations?: Record<string, string[]>;
}

/**
 * The `where` fragment for a list search: a case-insensitive match on any of
 * the given columns, JSON keys or columns of a to-one relation. A blank term adds no constraint, so callers
 * can spread the result unconditionally. The fragment is one `AND` entry, so it
 * never replaces the `OR` a tenant or scope filter already uses.
 */
export function buildSearchWhere<TWhere = Record<string, unknown>>(
  search: string | undefined,
  fields: SearchWhereFields,
): { AND?: TWhere[] } {
  const term = search?.trim();
  if (!term) {
    return {};
  }

  const columnMatches = (fields.columns ?? []).map((column) => ({
    [column]: { contains: term, mode: 'insensitive' },
  }));
  const jsonMatches = Object.entries(fields.json ?? {}).flatMap(
    ([column, keys]) =>
      keys.map((key) => ({
        [column]: { mode: 'insensitive', path: [key], string_contains: term },
      })),
  );
  const relationMatches = Object.entries(fields.relations ?? {}).flatMap(
    ([relation, columns]) =>
      columns.map((column) => ({
        [relation]: { [column]: { contains: term, mode: 'insensitive' } },
      })),
  );
  const matches = [...columnMatches, ...jsonMatches, ...relationMatches];

  // The fragment is built from caller-named fields, so it is a valid `TWhere`.
  return matches.length > 0 ? { AND: [{ OR: matches } as TWhere] } : {};
}
