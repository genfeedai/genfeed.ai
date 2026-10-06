import { FontFamily } from '@genfeedai/contracts';

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

  const normalized = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
  if (PERSISTED_FONT_FAMILIES.has(normalized)) {
    return normalized as FontFamily;
  }

  return undefined;
}
