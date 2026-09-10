/**
 * Query-string booleans arrive as `"true"` / `"false"`. Use this with
 * `@Transform(toOptionalBoolean)` so `@IsBoolean()` sees a real boolean.
 * Unrecognized values are returned unchanged so validation can reject them.
 */
export function toOptionalBoolean({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return value;
}

/** Coerce a query filter to boolean, or drop it when the value is not boolean. */
export function parseOptionalBoolean(value: unknown): boolean | undefined {
  const parsed = toOptionalBoolean({ value });
  return typeof parsed === 'boolean' ? parsed : undefined;
}
