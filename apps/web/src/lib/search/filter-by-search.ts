/**
 * Keeps the items for which any searchable field contains the term, ignoring
 * case and surrounding space. A blank term keeps everything. Use it for lists
 * the page already holds in memory; server-paged lists search on the server.
 */
export function filterBySearch<T>(
  items: readonly T[],
  search: string,
  getFields: (item: T) => ReadonlyArray<string | null | undefined>,
): T[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return [...items];
  }

  return items.filter((item) =>
    getFields(item).some((field) => field?.toLowerCase().includes(term)),
  );
}
