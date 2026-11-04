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

/**
 * Query flag that defaults to `false` when absent or blank. Use with
 * `@Transform(toBooleanDefaultFalse)`. Any other non-boolean value is coerced
 * with `Boolean(value)`.
 */
export function toBooleanDefaultFalse({ value }: { value: unknown }): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (value === 'true' || value === true) {
    return true;
  }
  if (value === 'false' || value === false || value === '0' || value === 0) {
    return false;
  }
  if (value === '') {
    return false;
  }
  return Boolean(value);
}

/**
 * Query filter that stays unset (`undefined`) when absent or blank, so the
 * filter is not applied. Use with `@Transform(toBooleanOrUnset)`. Other truthy
 * values become `true`; other falsy values stay unset.
 */
export function toBooleanOrUnset({
  value,
}: {
  value: unknown;
}): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === 'true' || value === true) {
    return true;
  }
  if (value === 'false' || value === false || value === '0' || value === 0) {
    return false;
  }
  if (value === '') {
    return undefined;
  }
  return value ? true : undefined;
}
