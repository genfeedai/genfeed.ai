export function formatListResult(
  items: readonly unknown[],
  noun: string,
  qualifier = '',
): string {
  return items.length > 0
    ? `Found ${items.length} ${noun}${qualifier}:\n\n${JSON.stringify(items, null, 2)}`
    : `No ${noun} found${qualifier}.`;
}
