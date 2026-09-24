export function normalizeBrandAudience(value: unknown): string[] {
  const entries = typeof value === 'string' ? [value] : value;
  return Array.isArray(entries)
    ? entries
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}
