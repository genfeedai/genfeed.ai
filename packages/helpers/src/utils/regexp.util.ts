const REGEX_SPECIAL_CHARS_PATTERN = /[.*+?^${}()|[\]\\]/g;

/** Escape regular-expression metacharacters so `value` matches literally. */
export function escapeRegExp(value: string): string {
  return value.replace(REGEX_SPECIAL_CHARS_PATTERN, '\\$&');
}
