import { FontFamily } from '@genfeedai/contracts';

const WHITESPACE_OR_HYPHEN_RUNS_PATTERN = /[\s-]+/g;

const PERSISTED_FONT_FAMILIES = new Set<string>(Object.values(FontFamily));

/**
 * Brand.fontFamily is the Prisma FontFamily enum. Scraped CSS stacks
 * (`-apple-system`, `Inter, sans-serif`) are not members and must not be written.
 * Recognizes the enum label and a light normalization of the same words.
 */
export function toPersistedFontFamily(
  value: string | null | undefined,
): FontFamily | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (PERSISTED_FONT_FAMILIES.has(trimmed)) {
    return trimmed as FontFamily;
  }

  const normalized = trimmed
    .toUpperCase()
    .replace(WHITESPACE_OR_HYPHEN_RUNS_PATTERN, '_');
  if (PERSISTED_FONT_FAMILIES.has(normalized)) {
    return normalized as FontFamily;
  }

  return undefined;
}

/** Create paths need a FontFamily even when the scrape has none. */
export function toPersistedFontFamilyOrDefault(
  value: string | null | undefined,
): FontFamily {
  return toPersistedFontFamily(value) ?? FontFamily.MONTSERRAT_BLACK;
}

/**
 * The create DTO takes any string for `fontFamily`; Prisma accepts only a
 * FontFamily member. Fields without a string `fontFamily` pass through.
 */
export function withPersistedFontFamily(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return typeof fields.fontFamily === 'string'
    ? {
        ...fields,
        fontFamily: toPersistedFontFamilyOrDefault(fields.fontFamily),
      }
    : fields;
}
