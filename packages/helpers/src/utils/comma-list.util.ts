/** Split a comma-separated form field into trimmed, non-empty items. */
export function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
