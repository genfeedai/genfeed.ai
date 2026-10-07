/**
 * Dependency-free record/string readers (#5909).
 *
 * This is the canonical home so packages that `@genfeedai/utils` itself
 * depends on (contracts, helpers, services) can share one implementation.
 * Everyone else keeps importing them from `@genfeedai/utils/data/extract.util`,
 * which re-exports this module. Deliberately not re-exported from the
 * constants barrel to avoid widening the root `@genfeedai/contracts` surface.
 */

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Trimmed non-empty string, otherwise `undefined`. */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/** Non-empty string returned as-is (not trimmed), otherwise `undefined`. */
export function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Non-blank string returned as-is (not trimmed), otherwise `undefined`. */
export function readNonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Any string (including empty), otherwise `undefined`. */
export function readRawString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Non-null object, arrays included (looser than `isRecord`). */
export function isObjectLike(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

/** Non-empty string returned as-is (not trimmed), otherwise `null`. */
export function readNonEmptyStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Trimmed non-empty string, otherwise `null`. */
export function readTrimmedStringOrNull(value: unknown): string | null {
  return readString(value) ?? null;
}

/** Non-blank string returned as-is (not trimmed), otherwise `null`. */
export function readNonBlankStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Plain object (arrays excluded), otherwise an empty record. */
export function readRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

/** Shallow copy of a plain object (arrays excluded), otherwise an empty record. */
export function readRecordCopy(value: unknown): UnknownRecord {
  return isRecord(value) ? { ...value } : {};
}

/** Plain object (arrays excluded), otherwise `null`. */
export function readRecordOrNull(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

/** Plain object (arrays excluded), otherwise `undefined`. */
export function readRecordOrUndefined(
  value: unknown,
): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined;
}
