const MIN_TOKEN_LENGTH = 3;

export function tokenizeForOverlap(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

export function scoreTextOverlap(text: string, query: string): number {
  const queryTokens = tokenizeForOverlap(query);
  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = text.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }
  return hits / queryTokens.length;
}

export function rankByQueryOverlap<T>(
  items: T[],
  query: string,
  readText: (item: T) => string,
): T[] {
  if (!query.trim()) {
    return items;
  }

  return [...items].sort(
    (left, right) =>
      scoreTextOverlap(readText(right), query) -
      scoreTextOverlap(readText(left), query),
  );
}
