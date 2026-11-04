/**
 * A string-list field may arrive as an array, a single string, or a
 * comma-separated string (`"a, b"`). Use with
 * `@Transform(toCommaSeparatedStrings)` so `@IsString({ each: true })` sees an
 * array. `null` and `undefined` become `undefined`; any other value is wrapped
 * so validation can reject it.
 */
export function toCommaSeparatedStrings({
  value,
}: {
  value: unknown;
}): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return value.includes(',')
      ? value.split(',').map((item) => item.trim())
      : [value];
  }
  return [value];
}
