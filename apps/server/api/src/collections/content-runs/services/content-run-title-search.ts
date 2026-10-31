import type { Prisma } from '@genfeedai/prisma';

/**
 * The `where` fragment for a title search on a content run, whose title lives
 * at `path` inside its `config` JSON. A blank term adds no constraint, so
 * callers can spread the result unconditionally. The fragment is one `AND`
 * entry, so it never replaces another filter on the same `where`.
 */
export function contentRunTitleSearch(
  path: string[],
  search: string | undefined,
): Pick<Prisma.ContentRunWhereInput, 'AND'> {
  const term = search?.trim();
  if (!term) {
    return {};
  }

  return {
    AND: [{ config: { mode: 'insensitive', path, string_contains: term } }],
  };
}
